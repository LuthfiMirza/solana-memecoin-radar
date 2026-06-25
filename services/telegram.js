const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../config/db');
const { buyToken, sellToken, portfolioSummary } = require('./portfolio');

let bot = null;

function enabled() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `$${number.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
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

async function sendMessage(message) {
  if (!enabled()) {
    console.log(`[TELEGRAM OFF]\n${message}`);
    return;
  }
  if (!bot) initBot(false);
  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { disable_web_page_preview: true });
}

function formatSignalAlert(token) {
  return [
    `${signalEmoji(token.signal)} Sinyal ${token.signal}: ${token.symbol || 'UNKNOWN'}`,
    `Alamat: ${token.tokenAddress}`,
    `Skor: ${token.score}/100`,
    `Harga: ${money(token.priceUsd)}`,
    `Likuiditas: ${money(token.liquidityUsd)}`,
    `Volume 24j: ${money(token.volume24hUsd)}`,
    `Market Cap: ${money(token.marketCapUsd)}`,
    `Top Holder: ${token.topHolderPercent ?? 'n/a'}%`,
    `Buy/Sell Ratio: ${Number(token.buySellRatio || 0).toFixed(2)}`,
    `RugCheck: ${token.rugStatus}`,
    '',
    token.aiSummary || 'Ringkasan AI belum tersedia.',
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

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling });

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
      const holdings = await portfolioSummary();
      if (holdings.length === 0) {
        await bot.sendMessage(message.chat.id, 'Portfolio aktif kosong.');
        return;
      }
      const lines = holdings.map((holding, index) => [
        `${index + 1}. ${holding.symbol || 'UNKNOWN'}`,
        `Alamat: ${holding.token_address}`,
        `Entry: ${money(holding.entry_price)} | Sekarang: ${money(holding.current_price)}`,
        `P&L: ${pct(holding.pnl_percent)} | TP: ${pct(holding.take_profit_percent)}`
      ].join('\n'));
      await bot.sendMessage(message.chat.id, `📊 Portfolio Aktif\n\n${lines.join('\n\n')}`);
    } catch (error) {
      await bot.sendMessage(message.chat.id, `⚠️ Gagal membaca portfolio: ${error.message}`);
    }
  });

  bot.on('polling_error', (error) => console.warn(`Telegram polling error: ${error.message}`));
  return bot;
}

module.exports = { initBot, sendMessage, sendSignalAlert, sendSellAlert, formatSignalAlert, formatSellAlert };
