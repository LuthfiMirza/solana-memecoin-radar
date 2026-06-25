const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../config/db');
const { buyToken, sellToken, portfolioSummary } = require('./portfolio');

let bot = null;
let shutdownHandlersRegistered = false;

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
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${normalized}/100`;
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

async function sendMessage(message) {
  if (!enabled()) {
    console.log(`[TELEGRAM OFF]\n${message}`);
    return;
  }
  if (!bot) initBot(false);
  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { disable_web_page_preview: true });
}

function formatSignalAlert(token) {
  const dexUrl = token.url || `https://dexscreener.com/solana/${token.tokenAddress}`;
  const rugUrl = `https://rugcheck.xyz/tokens/${token.tokenAddress}`;
  const breakdown = token.breakdown || {};

  return [
    `${signalEmoji(token.signal)} ${token.signal} SIGNAL — $${token.symbol || 'UNKNOWN'}`,
    `${token.name || 'Unknown Token'} | CA: ${shortAddress(token.tokenAddress)}`,
    '',
    `📊 Score: ${scoreBar(token.score)}`,
    `🏦 Liquidity: ${money(token.liquidityUsd)} (${breakdown.liquidity ?? 0} pts)`,
    `📈 Volume 24h: ${money(token.volume24hUsd)} (${breakdown.volume ?? 0} pts)`,
    `💰 Market Cap: ${money(token.marketCapUsd)} (${breakdown.marketCap ?? 0} pts)`,
    `👥 Top Holder: ${token.topHolderPercent ?? 'n/a'}% (${breakdown.topHolder ?? 0} pts)`,
    `⚖️ Buy/Sell: ${Number(token.buySellRatio || 0).toFixed(2)}x (${breakdown.buySellRatio ?? 0} pts)`,
    `🧠 Smart Wallets: ${token.smartWalletCount ?? 0} (${breakdown.smartWallet ?? 0} pts)`,
    `🐋 Whale Entry: ${token.whaleEntryCount ?? 0} (${breakdown.whaleEntry ?? 0} pts)`,
    `🛡️ RugCheck: ${rugEmoji(token.rugStatus)} (${breakdown.rugcheck ?? 0} pts)`,
    '',
    `🤖 AI: ${token.aiSummary || 'Ringkasan AI belum tersedia.'}`,
    '',
    `🔗 DexScreener: ${dexUrl}`,
    `🔗 RugCheck: ${rugUrl}`,
    '',
    `⏰ ${wibTimestamp()}`,
    `📍 CA: ${shortAddress(token.tokenAddress)}`,
    '',
    `Konfirmasi entry: /buy ${token.tokenAddress} <entry_price> <tp_percent>`
  ].join('\n');
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
    '🤖 *Memecoin Scanner Bot Commands*',
    '',
    '📊 */portfolio*',
    'Lihat semua posisi aktif + P&L',
    '',
    '🚀 */buy* <contract> <price> <tp%>',
    'Masuk posisi baru',
    'Contoh: /buy EPjFWdd5... 1.00 50',
    '',
    '❌ */sell* <contract>',
    'Tutup posisi manual',
    'Contoh: /sell EPjFWdd5...',
    '',
    '⚙️ *Settings*',
    '- TP default: 50%',
    '- SL default: -20%',
    '- ATH drop alert: -30%',
    '- Max holding: 5 token',
    '- Scan interval: 5 menit',
    '',
    '📈 *Signal Levels*',
    '🚀 BUY: Score ≥ 70',
    '👀 WATCH: Score 60-69',
    '❌ AVOID: Score < 60',
    '',
    '💡 Tips:',
    '- Monitor /portfolio setiap hari',
    '- Set TP realistis (20-100%)',
    '- SL automatic di -20%',
    '- Alerts via Telegram real-time'
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
    '2. Confirm entry dengan: /buy <contract> <price> <50>',
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

async function sendSellAlert(alert) {
  await sendMessage(formatSellAlert(alert));
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

  bot.onText(/^\/buy\s+(\S+)\s+(\S+)\s+(\S+)/, async (message, match) => {
    if (String(message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) return;
    try {
      const result = await buyToken(match[1], match[2], match[3]);
      await bot.sendMessage(message.chat.id, [
        `✅ Entry dikonfirmasi: ${result.symbol || 'UNKNOWN'}`,
        `Alamat: ${result.tokenAddress}`,
        `Entry: ${money(result.entryPrice)}`,
        `Target TP: ${result.takeProfitPercent}% (${money(result.takeProfitPrice)})`,
        `Stop loss: ${money(result.stopLossPrice)}`
      ].join('\n'));
    } catch (error) {
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
  formatSignalAlert,
  formatSellAlert,
  formatPortfolioCard,
  formatPortfolioSummary
};
