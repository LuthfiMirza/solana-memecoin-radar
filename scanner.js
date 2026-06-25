require('dotenv').config();
const cron = require('node-cron');
const { query, pool } = require('./config/db');
const { discoverNewTokens, isBlacklisted } = require('./services/discovery');
const { getTokenData } = require('./services/pairLookup');
const { getTopHolderPercent } = require('./services/holderAnalyzer');
const { checkToken } = require('./services/rugcheck');
const { scoreToken } = require('./services/scoring');
const { generateSummary } = require('./services/aiService');
const { monitorHoldings } = require('./services/portfolio');
const { initBot, sendSignalAlert, sendSellAlert } = require('./services/telegram');

async function getSmartWalletStats() {
  const rows = await query('SELECT COUNT(*) AS total FROM smart_wallets WHERE is_active = 1');
  return { smartWalletCount: rows[0]?.total || 0, whaleEntryCount: 0 };
}

async function wasSignalRecentlySent(tokenAddress, signal) {
  const rows = await query(
    'SELECT id FROM signals WHERE token_address = ? AND \`signal\` = ? AND sent_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE) LIMIT 1',
    [tokenAddress, signal, Number(process.env.SIGNAL_COOLDOWN_MINUTES || 240)]
  );
  return rows.length > 0;
}

async function saveToken(token) {
  await query(
    `INSERT INTO tokens
      (token_address, symbol, name, pair_address, dex_id, price_usd, liquidity_usd, volume_24h_usd, market_cap_usd,
       top_holder_percent, buy_sell_ratio, smart_wallet_count, whale_entry_count, rug_status, rug_score, score, \`signal\`, ai_summary, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       symbol = VALUES(symbol), name = VALUES(name), pair_address = VALUES(pair_address), dex_id = VALUES(dex_id),
       price_usd = VALUES(price_usd), liquidity_usd = VALUES(liquidity_usd), volume_24h_usd = VALUES(volume_24h_usd),
       market_cap_usd = VALUES(market_cap_usd), top_holder_percent = VALUES(top_holder_percent), buy_sell_ratio = VALUES(buy_sell_ratio),
       smart_wallet_count = VALUES(smart_wallet_count), whale_entry_count = VALUES(whale_entry_count), rug_status = VALUES(rug_status),
       rug_score = VALUES(rug_score), score = VALUES(score), \`signal\` = VALUES(\`signal\`), ai_summary = VALUES(ai_summary),
       raw_json = VALUES(raw_json), last_scanned_at = NOW()`,
    [
      token.tokenAddress, token.symbol, token.name, token.pairAddress, token.dexId, token.priceUsd, token.liquidityUsd,
      token.volume24hUsd, token.marketCapUsd, token.topHolderPercent, token.buySellRatio, token.smartWalletCount,
      token.whaleEntryCount, token.rugStatus, token.rugScore, token.score, token.signal, token.aiSummary,
      JSON.stringify(token.raw || {})
    ]
  );

  const rows = await query('SELECT id FROM tokens WHERE token_address = ? LIMIT 1', [token.tokenAddress]);
  return rows[0];
}

async function saveSignal(tokenId, token, message) {
  await query(
    'INSERT INTO signals (token_id, token_address, \`signal\`, score, message) VALUES (?, ?, ?, ?, ?)',
    [tokenId, token.tokenAddress, token.signal, token.score, message]
  );
}

async function analyzeToken(tokenAddress) {
  if (isBlacklisted(tokenAddress)) {
    if (process.env.NODE_ENV === 'debug') {
      console.log('Analyze skipped:', { tokenAddress, reason: 'BLACKLISTED' });
    }
    return null;
  }

  const pair = await getTokenData(tokenAddress);
  if (!pair) {
    if (process.env.NODE_ENV === 'debug') {
      console.log('Analyze skipped:', { tokenAddress, reason: 'NO_DEXSCREENER_PAIR' });
    }
    return null;
  }

  const [holder, rug, walletStats] = await Promise.all([
    getTopHolderPercent(tokenAddress),
    checkToken(tokenAddress),
    getSmartWalletStats(tokenAddress)
  ]);

  const scoringInput = {
    ...pair,
    topHolderPercent: holder.topHolderPercent,
    smartWalletCount: walletStats.smartWalletCount,
    whaleEntryCount: walletStats.whaleEntryCount,
    rugStatus: rug.status
  };
  const scoring = scoreToken(scoringInput);
  const token = {
    ...pair,
    tokenAddress,
    topHolderPercent: holder.topHolderPercent,
    smartWalletCount: walletStats.smartWalletCount,
    whaleEntryCount: walletStats.whaleEntryCount,
    rugStatus: rug.status,
    rugScore: rug.score,
    score: scoring.score,
    signal: scoring.signal,
    breakdown: scoring.breakdown,
    raw: { pair: pair.raw, holder, rug }
  };

  const ai = await generateSummary(token);
  token.aiProvider = ai.provider;
  token.aiSummary = ai.summary;
  if (process.env.NODE_ENV === 'debug') {
    console.log('Analyze result:', {
      tokenAddress,
      symbol: token.symbol,
      score: token.score,
      signal: token.signal,
      aiProvider: token.aiProvider
    });
  }
  return token;
}

async function testToken(tokenAddress) {
  if (!tokenAddress) {
    throw new Error('Format: node scanner.js --test <token_address>');
  }

  console.log(`[${new Date().toISOString()}] Test pipeline token: ${tokenAddress}`);
  const token = await analyzeToken(tokenAddress);
  if (!token) {
    console.log('Test result: token dilewati atau data pair tidak tersedia.');
    return;
  }

  console.log('Test summary:', {
    tokenAddress: token.tokenAddress,
    symbol: token.symbol,
    name: token.name,
    priceUsd: token.priceUsd,
    liquidityUsd: token.liquidityUsd,
    volume24hUsd: token.volume24hUsd,
    marketCapUsd: token.marketCapUsd,
    topHolderPercent: token.topHolderPercent,
    buySellRatio: token.buySellRatio,
    smartWalletCount: token.smartWalletCount,
    whaleEntryCount: token.whaleEntryCount,
    rugStatus: token.rugStatus,
    rugScore: token.rugScore,
    score: token.score,
    signal: token.signal,
    breakdown: token.breakdown,
    aiProvider: token.aiProvider,
    aiSummaryAvailable: Boolean(token.aiSummary)
  });
}

async function scanNewTokens() {
  console.log(`[${new Date().toISOString()}] Mulai scan token baru...`);
  const discovered = await discoverNewTokens();
  console.log(`Ditemukan ${discovered.length} kandidat token.`);

  for (const item of discovered) {
    try {
      const token = await analyzeToken(item.tokenAddress);
      if (!token) continue;
      const saved = await saveToken(token);

      if (['BUY', 'WATCH'].includes(token.signal)) {
        const alreadySent = await wasSignalRecentlySent(token.tokenAddress, token.signal);
        if (!alreadySent) {
          await sendSignalAlert(token);
          await saveSignal(saved.id, token, token.aiSummary);
        }
      }

      console.log(`${token.symbol} ${token.tokenAddress}: ${token.score}/100 ${token.signal}`);
    } catch (error) {
      console.warn(`Gagal analisis ${item.tokenAddress}: ${error.message}`);
    }
  }
}

async function monitorPortfolio() {
  console.log(`[${new Date().toISOString()}] Monitor portfolio aktif...`);
  const alerts = await monitorHoldings();
  for (const alert of alerts) {
    await sendSellAlert(alert);
  }
}

async function main() {
  const telegramPolling = process.env.TELEGRAM_POLLING !== 'false' && process.env.NODE_ENV !== 'debug';
  initBot(telegramPolling);
  await query('SELECT 1');
  console.log('Memecoin Scanner aktif. Cron scan: */5 menit, monitor portfolio: */2 menit.');

  cron.schedule('*/5 * * * *', () => scanNewTokens().catch((error) => console.error(`Scan error: ${error.message}`)));
  cron.schedule('*/2 * * * *', () => monitorPortfolio().catch((error) => console.error(`Portfolio error: ${error.message}`)));

  if (process.env.RUN_ON_START !== 'false') {
    await scanNewTokens().catch((error) => console.error(`Initial scan error: ${error.message}`));
    await monitorPortfolio().catch((error) => console.error(`Initial portfolio error: ${error.message}`));
  }
}

process.on('SIGINT', async () => {
  console.log('Menutup scanner...');
  await pool.end();
  process.exit(0);
});

const testIndex = process.argv.indexOf('--test');
const runner = testIndex >= 0 ? testToken(process.argv[testIndex + 1]) : main();

runner.catch(async (error) => {
  console.error(`Fatal: ${error.message}`);
  await pool.end();
  process.exit(1);
}).finally(async () => {
  if (testIndex >= 0) await pool.end();
});
