require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { query, pool } = require('../config/db');

const app = Fastify({ logger: true });
const PORT = Number(process.env.DASHBOARD_PORT || 3001);

app.register(cors, { origin: true });

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

app.get('/api/health', async () => {
  await query('SELECT 1');
  return { ok: true, service: 'KeyScanner coin API', time: new Date().toISOString() };
});

app.get('/api/dashboard', async () => {
  const [active, closed, signals, tokens, scoreHistory] = await Promise.all([
    query("SELECT * FROM portfolio WHERE `status` = 'ACTIVE' ORDER BY opened_at DESC LIMIT 5"),
    query("SELECT * FROM portfolio WHERE `status` = 'CLOSED' ORDER BY closed_at DESC LIMIT 20"),
    query("SELECT s.*, t.symbol, t.name, t.price_usd, t.liquidity_usd, t.volume_24h_usd, t.market_cap_usd FROM signals s LEFT JOIN tokens t ON t.id = s.token_id ORDER BY s.sent_at DESC LIMIT 10"),
    query('SELECT * FROM tokens ORDER BY last_scanned_at DESC LIMIT 12'),
    query("SELECT DATE_FORMAT(last_scanned_at, '%H:%i') AS label, AVG(score) AS avg_score, MAX(score) AS max_score FROM tokens WHERE last_scanned_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY DATE_FORMAT(last_scanned_at, '%Y-%m-%d %H:%i') ORDER BY MIN(last_scanned_at) ASC LIMIT 40")
  ]);

  const portfolioValue = active.reduce((sum, row) => sum + num(row.current_price || row.entry_price), 0);
  const totalEntryValue = active.reduce((sum, row) => sum + num(row.entry_price), 0);
  const pnlUsd = portfolioValue - totalEntryValue;
  const pnlPercent = totalEntryValue > 0 ? (pnlUsd / totalEntryValue) * 100 : 0;
  const wins = closed.filter((row) => num(row.pnl_percent) > 0).length;
  const accuracy = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const riskIndex = tokens.length > 0 ? (tokens.filter((row) => row.rug_status === 'RISK').length / tokens.length) * 100 : 0;

  return {
    metrics: {
      portfolioValue,
      pnlUsd,
      pnlPercent,
      activeCount: active.length,
      maxHoldings: 5,
      riskIndex,
      accuracy,
      tokenScanned: tokens.length,
      buySignals: signals.filter((row) => row.signal === 'BUY').length,
      watchSignals: signals.filter((row) => row.signal === 'WATCH').length
    },
    portfolio: active,
    closed,
    signals,
    marketPulse: tokens,
    scoreHistory
  };
});

app.get('/api/tokens', async () => query('SELECT * FROM tokens ORDER BY last_scanned_at DESC LIMIT 100'));
app.get('/api/portfolio', async () => query('SELECT * FROM portfolio ORDER BY opened_at DESC LIMIT 100'));
app.get('/api/signals', async () => query('SELECT * FROM signals ORDER BY sent_at DESC LIMIT 100'));

app.get('/api/events', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const send = async () => {
    try {
      const rows = await query('SELECT COUNT(*) AS tokens FROM tokens');
      reply.raw.write(`data: ${JSON.stringify({ type: 'heartbeat', tokens: rows[0]?.tokens || 0, time: Date.now() })}\n\n`);
    } catch (error) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    }
  };

  await send();
  const timer = setInterval(send, 15000);
  request.raw.on('close', () => clearInterval(timer));
});

async function start() {
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
  } catch (error) {
    app.log.error(error);
    await pool.end();
    process.exit(1);
  }
}

start();
