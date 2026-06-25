const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../config/db');
const { buyToken, sellToken, portfolioSummary } = require('./portfolio');
const { getTokenData } = require('./pairLookup');
const { getTopHolderPercent } = require('./holderAnalyzer');
const { checkToken } = require('./rugcheck');
const { scoreToken } = require('./scoring');
const { generateSummary } = require('./aiService');
const { detectWhaleEntries } = require('./whale');
const events = require('./events');

let bot = null;
let shutdownHandlersRegistered = false;
let eventHandlersRegistered = false;

function enabled() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `$${number.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
}

function moneyOrDash(value) {
  if (value === null || value === undefined) return '—';
  return money(value);
}

function pct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatUSD(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'N/A';
  if (number >= 1000) return `$${Math.round(number).toLocaleString('en-US')}`;
  if (number <= 0) return '$0';
  return `$${Number.parseFloat(number).toPrecision(4)}`;
}

function signalEmoji(signal) {
  if (signal === 'BUY') return '🚀';
  if (signal === 'WATCH') return '👀';
  return '❌';
}

function shortAddress(address) {
  if (!address || address.length <= 12) return address || 'n/a';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function scoreBar(score) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const filled = Math.round(normalized / 10);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
  return `${bar} ${normalized}/100`;
}

function cleanAI(summary) {
  if (!summary) return null;
  const clean = summary
    .replace(/\*/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  return clean.length > 280 ? `${clean.substring(0, 277)}...` : clean;
}

function rugEmoji(status) {
  if (status === 'SAFE') return '✅ SAFE';
  if (status === 'RISK') return '⚠️ RISK';
  return '❔ UNKNOWN';
}

function wibTimestamp(date = new Date()) {
  return `${date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  })} WIB`;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatHoldingDuration(openedAt) {
  const opened = new Date(openedAt).getTime();
  if (!Number.isFinite(opened)) return '—';
  const totalMinutes = Math.max(0, Math.floor((Date.now() - opened) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}j ${minutes}m`;
}

function dexScreenerUrl(tokenAddress) {
  return `https://dexscreener.com/solana/${tokenAddress}`;
}

function isSolanaAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value || '');
}

function formatBuyConfirmation(result) {
  const priceSource = result.priceSource || 'auto-fetch';
  return [
    '✅ Posisi dibuka!',
    '━━━━━━━━━━━━━━━━━━━━',
    `📍 Token  : $${result.symbol || 'UNKNOWN'} (${shortAddress(result.tokenAddress)})`,
    `💰 Entry  : ${money(result.entryPrice)} (${priceSource})`,
    `🎯 Target : ${money(result.takeProfitPrice)} (${pct(result.takeProfitPercent)})`,
    `🛑 Stop   : ${money(result.stopLossPrice)} (-20%)`,
    `⏰ Waktu  : ${wibTimestamp()}`,
    '',
    'Gunakan /portfolio untuk monitor posisi.'
  ].join('\n');
}

async function sendMessage(message) {
  if (!enabled()) {
    console.log(`[TELEGRAM OFF]\n${message}`);
    return;
  }
  if (!bot) initBot(false);
  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { disable_web_page_preview: true });
}

function formatSignalAlert(token) {
  const tokenAddress = token.tokenAddress || token.token_address;
  const pairAddress = token.pairAddress || token.pair_address || tokenAddress;
  const dexUrl = token.url || `https://dexscreener.com/solana/${pairAddress}`;
  const rugUrl = `https://rugcheck.xyz/tokens/${tokenAddress}`;
  const aiSummary = cleanAI(token.aiSummary || token.ai_summary);
  const topHolder = token.topHolderPercent ?? token.top_holder_percent;
  const topHolderDisplay = topHolder !== null && topHolder !== undefined && Number.isFinite(Number(topHolder))
    ? `${Number(topHolder).toFixed(2)}%`
    : 'N/A';
  const headerEmoji = token.signal === 'BUY' ? '🚀' : token.signal === 'WATCH' ? '👀' : '❌';
  const lines = [
    `${headerEmoji} ${token.signal} SIGNAL — $${token.symbol || 'UNKNOWN'}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `💎 Name    : ${token.name || 'Unknown Token'}`,
    `📍 CA      : ${shortAddress(tokenAddress)}`,
    `💰 Price   : ${formatUSD(token.priceUsd ?? token.price_usd)}`,
    '',
    `📊 Score   : ${scoreBar(token.score)}`,
    '',
    `🏦 Liquidity : ${formatUSD(token.liquidityUsd ?? token.liquidity_usd)}`,
    `📈 Volume 24h: ${formatUSD(token.volume24hUsd ?? token.volume_24h_usd)}`,
    `💰 Market Cap: ${formatUSD(token.marketCapUsd ?? token.market_cap_usd)}`,
    `👥 Top Holder: ${topHolderDisplay}`,
    `⚖️ Buy/Sell  : ${Number(token.buySellRatio ?? token.buy_sell_ratio ?? 0).toFixed(2)}x`,
    `🧠 Smart     : ${token.smartWalletCount ?? token.smart_wallet_count ?? 0} wallets`,
    `🐋 Whale     : ${token.whaleEntryCount ?? token.whale_entry_count ?? 0} entries`,
    `🛡️ RugCheck  : ${rugEmoji(token.rugStatus ?? token.rug_status)}`
  ];

  if (aiSummary) {
    lines.push('', '🤖 AI Insight:', aiSummary);
  }

  lines.push(
    '',
    `🔗 Chart  : ${dexUrl}`,
    `🔗 Risk   : ${rugUrl}`,
    `⏰ ${wibTimestamp()}`,
    '',
    `💡 /buy ${tokenAddress} 200`
  );

  return lines.join('\n');
}

function formatSellAlert(alert) {
  const reason = {
    TAKE_PROFIT: 'Take profit tercapai',
    STOP_LOSS: 'Stop loss -20% tersentuh',
    ATH_DROP: 'Turun -30% dari ATH sejak entry'
  }[alert.trigger] || alert.trigger;

  return [
    `🔔 Alert JUAL: ${alert.symbol || 'UNKNOWN'}`,
    `Alasan: ${reason}`,
    `Alamat: ${alert.token_address}`,
    `Entry: ${money(alert.entry_price)}`,
    `Harga sekarang: ${money(alert.currentPrice)}`,
    `P&L: ${pct(alert.pnlPercent)}`,
    `ATH sejak entry: ${money(alert.athPrice)}`,
    `Drop dari ATH: ${pct(alert.athDropPercent)}`
  ].join('\n');
}

function formatAutoSellAlert(position, reason, currentPrice) {
  const reasonConfig = {
    TP: { title: '🎯 TAKE PROFIT HIT', label: 'TP' },
    SL: { title: '🛑 STOP LOSS HIT', label: 'SL' },
    ATH_DROP: { title: '📉 ATH DROP ALERT', label: 'ATH_DROP' }
  }[reason] || { title: '🔔 SELL ALERT', label: reason };
  const entryPrice = Number(position.entry_price || 0);
  const exitPrice = Number(currentPrice || position.currentPrice || position.close_price || 0);
  const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : Number(position.pnlPercent || position.pnl_percent || 0);
  const pnlIcon = pnlPercent >= 0 ? '🟢' : '🔴';
  const tokenAddress = position.token_address || position.tokenAddress;

  return [
    `${reasonConfig.title} — $${position.symbol || 'UNKNOWN'}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📍 CA      : ${shortAddress(tokenAddress)}`,
    `💰 Entry   : ${formatUSD(entryPrice)}`,
    `📈 Exit    : ${formatUSD(exitPrice)}`,
    `📊 P&L     : ${pct(pnlPercent)} ${pnlIcon}`,
    `⏱️ Hold    : ${formatHoldingDuration(position.opened_at)}`,
    '',
    `🔗 Chart: ${dexScreenerUrl(tokenAddress)}`,
    `⏰ ${wibTimestamp()}`,
    '',
    '💡 Posisi otomatis ditutup. Gunakan /portfolio untuk cek sisa posisi.'
  ].join('\n');
}

async function getSmartWalletStats() {
  const rows = await query('SELECT COUNT(*) AS total FROM smart_wallets WHERE is_active = 1');
  return { smartWalletCount: rows[0]?.total || 0 };
}

async function analyzeTokenForTelegram(tokenAddress) {
  const pair = await getTokenData(tokenAddress);
  if (!pair) return null;

  const [holder, rug, walletStats] = await Promise.all([
    getTopHolderPercent(tokenAddress),
    checkToken(tokenAddress),
    getSmartWalletStats()
  ]);

  let scoringInput = {
    ...pair,
    topHolderPercent: holder.topHolderPercent,
    smartWalletCount: walletStats.smartWalletCount,
    whaleEntryCount: 0,
    rugStatus: rug.status
  };
  let scoring = scoreToken(scoringInput);
  let whale = { whaleCount: 0, note: 'Skipped score < 40' };

  if (scoring.score >= 40) {
    whale = await detectWhaleEntries(tokenAddress, pair.priceUsd);
    scoringInput = { ...scoringInput, whaleEntryCount: whale.whaleCount };
    scoring = scoreToken(scoringInput);
  }

  const token = {
    ...pair,
    tokenAddress,
    topHolderPercent: holder.topHolderPercent,
    smartWalletCount: walletStats.smartWalletCount,
    whaleEntryCount: whale.whaleCount,
    rugStatus: rug.status,
    rugScore: rug.score,
    score: scoring.score,
    signal: scoring.signal,
    breakdown: scoring.breakdown,
    raw: { pair: pair.raw, holder, rug, whale }
  };
  const ai = await generateSummary(token);
  token.aiProvider = ai.provider;
  token.aiSummary = ai.summary;
  return token;
}

function formatManualScanResult(token) {
  const lines = formatSignalAlert(token).split('\n');
  lines[0] = '🔍 MANUAL SCAN RESULT';
  const base = lines.join('\n');
  if (token.score >= 40) return base;
  return `${base}\n\n❌ Tidak disarankan untuk entry.`;
}

function formatPortfolioCard(holding) {
  const pnlPercent = Number(holding.pnl_percent || 0);
  const isProfit = pnlPercent >= 0;
  const icon = isProfit ? '🟢' : '🔴';
  const symbol = htmlEscape(holding.symbol || 'UNKNOWN');
  const targetPercent = Number(holding.take_profit_percent || 0);

  return [
    `${icon} <b>$${symbol} — ${pct(pnlPercent)}</b>`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    `💰 Entry  : ${money(holding.entry_price)}`,
    '',
    `📈 Current: ${moneyOrDash(holding.current_price)}`,
    '',
    `🎯 Target : ${money(holding.take_profit_price)} (${pct(targetPercent)})`,
    '',
    `🛑 Stop   : ${money(holding.stop_loss_price)} (-20%)`,
    '',
    `📊 ATH    : ${moneyOrDash(holding.ath_price)}`,
    '',
    `⏱️ Holding: ${formatHoldingDuration(holding.opened_at)}`,
    '',
    `📍 CA: ${shortAddress(holding.token_address)}`
  ].join('\n');
}

function formatPortfolioSummary(holdings) {
  const active = holdings.length;
  const profitHoldings = holdings.filter((holding) => Number(holding.pnl_percent || 0) >= 0);
  const sorted = [...holdings].sort((a, b) => Number(b.pnl_percent || 0) - Number(a.pnl_percent || 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return [
    '📊 <b>PORTFOLIO SUMMARY</b>',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    `Active  : ${active}/5 positions`,
    '',
    `🟢 Profit: ${profitHoldings.length} position`,
    '',
    `🔴 Loss  : ${active - profitHoldings.length} position`,
    '',
    `Best    : ${best ? `${pct(best.pnl_percent)} $${htmlEscape(best.symbol || 'UNKNOWN')}` : '—'}`,
    '',
    `Worst   : ${worst ? `${pct(worst.pnl_percent)} $${htmlEscape(worst.symbol || 'UNKNOWN')}` : '—'}`
  ].join('\n');
}

function portfolioButtons(tokenAddress) {
  return {
    inline_keyboard: [[
      { text: '📊 DexScreener', url: dexScreenerUrl(tokenAddress) },
      { text: '🔴 Sell Now', callback_data: `sell_confirm:${tokenAddress}` }
    ]]
  };
}

async function registerBotCommands() {
  if (!bot) return;
  try {
    await bot.setMyCommands([
      { command: 'start', description: '👋 Mulai & panduan singkat' },
      { command: 'help', description: '📖 Semua command dijelaskan' },
      { command: 'portfolio', description: '📊 Lihat posisi aktif & P&L' },
      { command: 'buy', description: '🟢 Buka posisi baru' },
      { command: 'sell', description: '🔴 Tutup posisi' },
      { command: 'scan', description: '🔍 Analisis token manual by address' },
      { command: 'status', description: '🔧 Status bot & sistem' },
      { command: 'config', description: '⚙️ Lihat konfigurasi aktif' }
    ]);
  } catch (error) {
    console.warn(`Gagal register Telegram command menu: ${error.message}`);
  }
}

function registerEventHandlers() {
  if (eventHandlersRegistered) return;
  events.on('sell_triggered', ({ position, reason, currentPrice }) => {
    sendSellAlert(position, reason, currentPrice).catch((error) => console.warn(`Gagal kirim sell alert: ${error.message}`));
  });
  eventHandlersRegistered = true;
}

async function sendPortfolioCards(chatId) {
  const holdings = await portfolioSummary();
  if (holdings.length === 0) {
    await bot.sendMessage(chatId, '📭 Tidak ada posisi aktif.\n\nGunakan /buy untuk mulai tracking.');
    return;
  }

  for (const holding of holdings) {
    await bot.sendMessage(chatId, formatPortfolioCard(holding), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: portfolioButtons(holding.token_address)
    });
  }

  await bot.sendMessage(chatId, formatPortfolioSummary(holdings), { parse_mode: 'HTML' });
}

function formatHelpMessage() {
  return [
    '📖 *DAFTAR COMMAND*',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '🟢 */buy* <address> <tp%>',
    '   Contoh: /buy FeMb...pump 200',
    '   Auto-fetch harga dari DexScreener',
    '',
    '🟢 */buy* <address> <tp%> <harga>',
    '   Contoh: /buy FeMb...pump 200 0.00471',
    '   Manual input harga beli dari OKX',
    '',
    '📊 */portfolio*',
    '   Lihat semua posisi aktif + P&L',
    '',
    '🔴 */sell* <address>',
    '   Tutup posisi & catat hasil',
    '',
    '🔍 */scan* <address>',
    '   Analisis token manual by address',
    '',
    '🔧 */status*',
    '   Cek bot hidup, DB, API connections',
    '   Lihat setting TP/SL/ATH drop aktif',
    '',
    '⚙️ */config*',
    '   Lihat konfigurasi scanner dan data source',
    '',
    '👋 */start*',
    '   Mulai bot dan lihat panduan singkat'
  ].join('\n');
}

function formatStartMessage() {
  return [
    '👋 Selamat datang di *Memecoin Scanner Bot*!',
    '',
    'Bot ini scan dan score token Solana otomatis setiap 5 menit.',
    'Memberikan sinyal BUY 🚀, WATCH 👀, atau AVOID ❌.',
    '',
    '🚀 *Quick Start:*',
    '1. Tunggu signal WATCH/BUY via Telegram',
    '2. Confirm entry dengan: /buy <contract> <tp%>',
    '3. Monitor di: /portfolio',
    '4. Close posisi: /sell <contract>',
    '',
    '📚 Lihat semua command:',
    '/help',
    '',
    '📊 Status bot:',
    '/status',
    '',
    '⚙️ Pengaturan:',
    '/config',
    '',
    '💡 Tips:',
    '- TP default 50%, SL default -20%',
    '- Max 5 posisi sekaligus',
    '- Alerts real-time via Telegram',
    '- Monitoring setiap 2 menit',
    '',
    'Mulai dengan /help atau tunggu signal berikutnya! 🎯'
  ].join('\n');
}

function formatConfigMessage() {
  return [
    '⚙️ *Bot Configuration*',
    '',
    '📈 *Scoring Settings:*',
    '- Liquidity weight: 15%',
    '- Volume weight: 15%',
    '- Market Cap weight: 15%',
    '- Buy/Sell ratio weight: 20%',
    '- RugCheck weight: 10%',
    '- AI Analysis weight: 25%',
    '',
    '🎯 *Signal Thresholds:*',
    '- BUY 🚀: Score ≥ 70',
    '- WATCH 👀: Score 60-69',
    '- AVOID ❌: Score < 60',
    '',
    '💰 *Portfolio Settings:*',
    '- TP default: 50%',
    '- SL default: -20%',
    '- ATH drop alert: -30%',
    '- Max holdings: 5 token',
    '- Signal cooldown: 240 min',
    '',
    '⏱️ *Timing:*',
    '- Token scan: every 5 minutes',
    '- Portfolio monitor: every 2 minutes',
    '- Alert cooldown: 4 hours per token',
    '',
    '📊 *Data Sources:*',
    '- Discovery: Helius API',
    '- Price/liquidity: DexScreener',
    '- Risk check: RugCheck',
    '- AI analysis: Groq + Gemini',
    '',
    'Untuk ubah settings, hubungi admin.'
  ].join('\n');
}

async function sendSignalAlert(token) {
  await sendMessage(formatSignalAlert(token));
}

async function sendSellAlert(position, reason, currentPrice) {
  if (reason) {
    await sendMessage(formatAutoSellAlert(position, reason, currentPrice));
    return;
  }
  await sendMessage(formatSellAlert(position));
}

async function getStatusMessage() {
  const [portfolioRows, signalRows, tokenRows] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM portfolio WHERE `status` = 'ACTIVE'"),
    query('SELECT COUNT(*) AS count FROM signals WHERE DATE(sent_at) = CURDATE()'),
    query('SELECT COUNT(*) AS count FROM tokens WHERE DATE(first_seen_at) = CURDATE()')
  ]);

  return [
    '🤖 *Bot Status: ONLINE* ✅',
    '',
    '📊 *Today Statistics:*',
    `- Token scanned: ${tokenRows[0]?.count || 0}`,
    `- Signals sent: ${signalRows[0]?.count || 0}`,
    `- Active positions: ${portfolioRows[0]?.count || 0}/5`,
    '',
    '⏰ *Schedule:*',
    '- Scan: every 5 minutes',
    '- Portfolio check: every 2 minutes',
    `- Last update: ${new Date().toLocaleString('id-ID')}`,
    '',
    '💚 Bot is healthy and running!'
  ].join('\n');
}

function summaryDateWib(date = new Date()) {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

function closeReasonLabel(reason) {
  return { TP: 'TP', SL: 'SL', ATH_DROP: 'ATH Drop', MANUAL: 'Manual' }[reason] || reason || 'Unknown';
}

async function sendDailySummary() {
  const [signalRows, closedRows, activeRows] = await Promise.all([
    query(`SELECT \`signal\`, COUNT(*) AS total FROM signals WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY \`signal\``),
    query(`SELECT symbol, pnl_percent, close_reason FROM portfolio WHERE \`status\` = 'CLOSED' AND closed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY closed_at DESC`),
    query(`SELECT symbol, pnl_percent, take_profit_percent FROM portfolio WHERE \`status\` = 'ACTIVE' ORDER BY opened_at ASC`)
  ]);

  const signalCounts = signalRows.reduce((acc, row) => ({ ...acc, [row.signal]: row.total }), {});
  const closedCount = closedRows.length;
  const wins = closedRows.filter((row) => Number(row.pnl_percent || 0) > 0).length;
  const winRate = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;
  const closedLines = closedRows.length > 0
    ? closedRows.map((row) => `${Number(row.pnl_percent || 0) >= 0 ? '🟢' : '🔴'} $${row.symbol || 'UNKNOWN'} ${pct(row.pnl_percent)} (${closeReasonLabel(row.close_reason)})`)
    : ['📭 Tidak ada posisi ditutup.'];
  const activeLines = activeRows.length > 0
    ? activeRows.map((row) => `- $${row.symbol || 'UNKNOWN'} | ${pct(row.pnl_percent)} | TP target ${pct(row.take_profit_percent)}`)
    : ['- Tidak ada posisi aktif.'];

  const lines = [
    `📅 DAILY SUMMARY — ${summaryDateWib()}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '📡 Signal Kemarin:',
    `🚀 BUY  : ${signalCounts.BUY || 0} signal`,
    `👀 WATCH: ${signalCounts.WATCH || 0} signal`,
    '',
    '💼 Posisi Ditutup:',
    ...closedLines,
    '',
    `📊 Win Rate Kemarin: ${winRate}% (${wins}/${closedCount})`,
    '',
    '💼 Posisi Aktif Sekarang:',
    ...activeLines,
    '',
    '⏰ Scan berjalan normal. Next summary: besok 08.00 WIB.'
  ];

  if ((signalCounts.BUY || 0) === 0 && (signalCounts.WATCH || 0) === 0) {
    lines.splice(6, 0, '📭 Tidak ada signal kemarin. Scanner tetap aktif.');
  }

  await sendMessage(lines.join('\n'));
}

function initBot(polling = true) {
  if (!enabled()) {
    console.log('Telegram belum aktif. Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di .env.');
    return null;
  }
  if (bot) return bot;

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: false,
    request: { timeout: 30000 }
  });
  registerBotCommands();
  registerEventHandlers();

  if (polling) {
    bot.startPolling({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'callback_query'],
      params: { allowed_updates: ['message', 'callback_query'] }
    });
  }

  if (!shutdownHandlersRegistered) {
    const stopPolling = async () => {
      if (bot?.isPolling()) await bot.stopPolling();
    };
    process.once('SIGINT', stopPolling);
    process.once('SIGTERM', stopPolling);
    shutdownHandlersRegistered = true;
  }

  bot.onText(/^\/buy(?:\s+.+)?$/, async (message) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    const parts = message.text.trim().split(/\s+/);
    const tokenAddress = parts[1];
    const takeProfitPercent = Number(parts[2]);
    const manualPrice = parts[3] ? Number(parts[3]) : null;

    if (!tokenAddress || !Number.isFinite(takeProfitPercent) || takeProfitPercent <= 0) {
      await bot.sendMessage(message.chat.id, '❌ Format salah.\nGunakan: /buy <token_address> <tp_persen>\nContoh: /buy FeMbDoX...pump 200\nManual: /buy FeMbDoX...pump 200 0.00471');
      return;
    }
    if (parts[3] && (!Number.isFinite(manualPrice) || manualPrice <= 0)) {
      await bot.sendMessage(message.chat.id, '❌ Harga manual tidak valid. Contoh: /buy <address> 200 0.00471');
      return;
    }

    try {
      let pair = null;
      let entryPrice = manualPrice;
      let priceSource = 'manual';

      if (!manualPrice) {
        priceSource = 'auto-fetch';
        await bot.sendMessage(message.chat.id, '⏳ Mengambil harga current dari DexScreener...');
        pair = await getTokenData(tokenAddress).catch(() => null);
        entryPrice = Number(pair?.price_usd ?? pair?.priceUsd);
        if (!pair || !Number.isFinite(entryPrice) || entryPrice <= 0) {
          await bot.sendMessage(message.chat.id, '❌ Gagal ambil harga. Token tidak ditemukan di DexScreener.');
          return;
        }
      }

      const result = await buyToken(tokenAddress, entryPrice, takeProfitPercent);
      await bot.sendMessage(message.chat.id, formatBuyConfirmation({ ...result, symbol: result.symbol || pair?.symbol, priceSource }));
    } catch (error) {
      if (error.message === 'MAX_ACTIVE_POSITIONS') {
        await bot.sendMessage(message.chat.id, '❌ Maksimal 5 posisi aktif. Gunakan /sell untuk menutup posisi dulu.');
        return;
      }
      if (error.message === 'TOKEN_ALREADY_ACTIVE') {
        await bot.sendMessage(message.chat.id, '⚠️ Token ini sudah ada di portfolio aktif kamu.');
        return;
      }
      await bot.sendMessage(message.chat.id, `⚠️ Gagal /buy: ${error.message}`);
    }
  });

  bot.onText(/^\/sell\s+(\S+)/, async (message, match) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    try {
      const result = await sellToken(match[1], 'MANUAL');
      await bot.sendMessage(message.chat.id, `✅ Posisi ditutup manual: ${result.tokenAddress}\nHarga close: ${money(result.closePrice)}`);
    } catch (error) {
      await bot.sendMessage(message.chat.id, `⚠️ Gagal /sell: ${error.message}`);
    }
  });

  bot.onText(/^\/scan(?:\s+(\S+))?$/, async (message, match) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    const tokenAddress = match[1];
    if (!isSolanaAddress(tokenAddress)) {
      await bot.sendMessage(message.chat.id, '❌ Format salah. Gunakan: /scan <token_address>');
      return;
    }

    await bot.sendMessage(message.chat.id, '⏳ Menganalisis token... Mohon tunggu 10-15 detik.');
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('SCAN_TIMEOUT')), 30000));
      const token = await Promise.race([analyzeTokenForTelegram(tokenAddress), timeout]);
      if (!token) {
        await bot.sendMessage(message.chat.id, '❌ Token tidak ditemukan di DexScreener. Pastikan token sudah listed.');
        return;
      }
      await bot.sendMessage(message.chat.id, formatManualScanResult(token), { disable_web_page_preview: true });
    } catch (error) {
      if (error.message === 'SCAN_TIMEOUT') {
        await bot.sendMessage(message.chat.id, '⚠️ Analisis timeout. Coba lagi.');
        return;
      }
      await bot.sendMessage(message.chat.id, `⚠️ Gagal scan token: ${error.message}`);
    }
  });

  bot.onText(/^\/help$/, async (message) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    await bot.sendMessage(message.chat.id, formatHelpMessage(), { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/start$/, async (message) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    await bot.sendMessage(message.chat.id, formatStartMessage(), { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/status$/, async (message) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    try {
      await bot.sendMessage(message.chat.id, await getStatusMessage(), { parse_mode: 'Markdown' });
    } catch (error) {
      await bot.sendMessage(message.chat.id, `❌ Error: ${error.message}`);
    }
  });

  bot.onText(/^\/config$/, async (message) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    await bot.sendMessage(message.chat.id, formatConfigMessage(), { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/portfolio/, async (message) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    try {
      await sendPortfolioCards(message.chat.id);
    } catch (error) {
      await bot.sendMessage(message.chat.id, `⚠️ Gagal membaca portfolio: ${error.message}`);
    }
  });

  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message?.chat?.id;
    if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) return;

    const data = callbackQuery.data || '';
    if (!data.startsWith('sell_confirm:')) return;

    const tokenAddress = data.replace('sell_confirm:', '');
    try {
      const holdings = await portfolioSummary();
      const holding = holdings.find((item) => item.token_address === tokenAddress);
      const symbol = holding?.symbol || 'UNKNOWN';
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Konfirmasi jual lewat command /sell.' });
      await bot.sendMessage(chatId, `Yakin jual $${symbol}? Ketik /sell ${tokenAddress} untuk konfirmasi.`);
    } catch (error) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: `Error: ${error.message}`, show_alert: true });
    }
  });

  bot.on('polling_error', (error) => console.warn(`Telegram polling error: ${error.message}`));
  return bot;
}

module.exports = {
  initBot,
  sendMessage,
  sendSignalAlert,
  sendSellAlert,
  sendDailySummary,
  formatBuyConfirmation,
  formatSignalAlert,
  formatSellAlert,
  formatAutoSellAlert,
  formatManualScanResult,
  analyzeTokenForTelegram,
  formatPortfolioCard,
  formatPortfolioSummary
};
