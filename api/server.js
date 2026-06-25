require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { query, pool } = require('../config/db');

const app = Fastify({ logger: true });
const PORT = Number(process.env.DASHBOARD_PORT || 3001);
const STALE_THRESHOLD_MINUTES = 15;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const SIGNALS = new Set(['BUY', 'WATCH', 'AVOID']);
const RUG_STATUSES = new Set(['SAFE', 'RISK', 'UNKNOWN']);
const PORTFOLIO_STATUSES = new Set(['ACTIVE', 'CLOSED']);
const ORDERS = new Set(['asc', 'desc']);

app.register(cors, { origin: true });

const tokenSorts = {
  lastScannedAt: 'last_scanned_at',
  score: 'score',
  liquidity: 'liquidity_usd',
  volume: 'volume_24h_usd',
  marketCap: 'market_cap_usd'
};
const portfolioSorts = {
  openedAt: 'opened_at',
  closedAt: 'closed_at',
  pnlPercent: 'pnl_percent',
  status: '`status`'
};
const signalSorts = {
  sentAt: 's.sent_at',
  score: 's.score',
  signal: 's.`signal`'
};

function sendError(reply, statusCode, code, message, details = {}) {
  return reply.code(statusCode).send({ error: { code, message, details } });
}

function parseInteger(value, field, { defaultValue, min = 1, max } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    throw Object.assign(new Error(`${field} must be an integer between ${min} and ${max ?? '∞'}`), { field });
  }
  return parsed;
}

function parsePagination(params) {
  return {
    page: parseInteger(params.page, 'page', { defaultValue: 1, min: 1 }),
    limit: parseInteger(params.limit, 'limit', { defaultValue: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT })
  };
}

function parseOrder(value) {
  if (!value) return 'desc';
  const normalized = String(value).toLowerCase();
  if (!ORDERS.has(normalized)) throw Object.assign(new Error('order must be asc or desc'), { field: 'order' });
  return normalized;
}

function parseSort(value, whitelist, defaultSort) {
  if (!value) return { key: defaultSort, sql: whitelist[defaultSort] };
  if (!whitelist[value]) throw Object.assign(new Error(`sort must be one of: ${Object.keys(whitelist).join(', ')}`), { field: 'sort' });
  return { key: value, sql: whitelist[value] };
}

function parseEnum(value, allowed, field) {
  if (!value) return null;
  const normalized = String(value).toUpperCase();
  if (!allowed.has(normalized)) throw Object.assign(new Error(`${field} is invalid`), { field });
  return normalized;
}

function parseMinScore(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw Object.assign(new Error('minScore must be a number between 0 and 100'), { field: 'minScore' });
  }
  return parsed;
}

function parseAddress(address) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(address || '')) {
    throw Object.assign(new Error('Invalid token address'), { field: 'address' });
  }
  return address;
}

function paginationMeta(total, page, limit) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0
  };
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() - 7 * 60 * 60 * 1000).toISOString();
}

function dayBoundsWib(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return {
    startWib: `${parts.year}-${parts.month}-${parts.day} 00:00:00`,
    endWib: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000)).replaceAll('/', '-') + ' 00:00:00'
  };
}

function scannerState(lastScannerActivityAt) {
  if (!lastScannerActivityAt) return { scannerStale: null, scannerStatus: 'unknown' };
  const ageMs = Date.now() - new Date(lastScannerActivityAt).getTime();
  const stale = ageMs > STALE_THRESHOLD_MINUTES * 60 * 1000;
  return { scannerStale: stale, scannerStatus: stale ? 'stale' : 'recent' };
}

function mapToken(row) {
  return {
    id: row.id,
    tokenAddress: row.token_address,
    symbol: row.symbol,
    name: row.name,
    pairAddress: row.pair_address,
    dexId: row.dex_id,
    priceUsd: row.price_usd,
    liquidityUsd: row.liquidity_usd,
    volume24hUsd: row.volume_24h_usd,
    marketCapUsd: row.market_cap_usd,
    topHolderPercent: row.top_holder_percent,
    buySellRatio: row.buy_sell_ratio,
    smartWalletCount: row.smart_wallet_count,
    whaleEntryCount: row.whale_entry_count,
    rugStatus: row.rug_status,
    rugScore: row.rug_score,
    score: row.score,
    signal: row.signal,
    aiSummary: row.ai_summary,
    firstSeenAt: toIso(row.first_seen_at),
    lastScannedAt: toIso(row.last_scanned_at),
    rawJson: row.raw_json ?? null,
    links: {
      dexScreener: row.pair_address ? `https://dexscreener.com/solana/${row.pair_address}` : `https://dexscreener.com/solana/${row.token_address}`,
      rugCheck: `https://rugcheck.xyz/tokens/${row.token_address}`
    }
  };
}

function mapPosition(row) {
  return {
    id: row.id,
    tokenAddress: row.token_address,
    symbol: row.symbol,
    entryPrice: row.entry_price,
    takeProfitPercent: row.take_profit_percent,
    takeProfitPrice: row.take_profit_price,
    stopLossPrice: row.stop_loss_price,
    athPrice: row.ath_price,
    currentPrice: row.current_price,
    pnlPercent: row.pnl_percent,
    status: row.status,
    closePrice: row.close_price,
    closeReason: row.close_reason,
    openedAt: toIso(row.opened_at),
    closedAt: toIso(row.closed_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapSignal(row) {
  return {
    id: row.id,
    tokenId: row.token_id,
    tokenAddress: row.token_address,
    symbol: row.symbol ?? null,
    name: row.name ?? null,
    signal: row.signal,
    score: row.score,
    priceAtSignal: row.price_at_signal ?? null,
    currentTokenPrice: row.current_token_price ?? row.price_usd ?? null,
    message: row.message,
    sentAt: toIso(row.sent_at),
    telegramStatus: null
  };
}

function scoreDistributionRows(rows) {
  const buckets = [
    { bucket: '0-19', min: 0, max: 19, count: 0 },
    { bucket: '20-39', min: 20, max: 39, count: 0 },
    { bucket: '40-59', min: 40, max: 59, count: 0 },
    { bucket: '60-69', min: 60, max: 69, count: 0 },
    { bucket: '70-100', min: 70, max: 100, count: 0 }
  ];
  for (const row of rows) {
    const score = Number(row.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) continue;
    const target = buckets.find((bucket) => score >= bucket.min && score <= bucket.max);
    if (target) target.count += Number(row.total || 0);
  }
  return buckets.map(({ bucket, count }) => ({ bucket, count }));
}

async function getHealthPayload() {
  const started = process.hrtime.bigint();
  try {
    await query('SELECT 1');
    const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const rows = await query('SELECT MAX(last_scanned_at) AS lastScannerActivityAt FROM tokens');
    const lastScannerActivityAt = toIso(rows[0]?.lastScannerActivityAt);
    const state = scannerState(lastScannerActivityAt);
    return {
      status: 'ok',
      api: {
        status: 'online',
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString()
      },
      database: { status: 'online', latencyMs: Math.round(latencyMs) },
      scanner: { lastScannerActivityAt, ...state, staleThresholdMinutes: STALE_THRESHOLD_MINUTES }
    };
  } catch (error) {
    return {
      status: 'degraded',
      api: {
        status: 'online',
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString()
      },
      database: { status: 'offline', latencyMs: null },
      scanner: { lastScannerActivityAt: null, scannerStale: null, scannerStatus: 'unknown', staleThresholdMinutes: STALE_THRESHOLD_MINUTES }
    };
  }
}

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  return sendError(reply, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
});

app.get('/api/health', async (request, reply) => {
  const health = await getHealthPayload();
  return reply.code(health.status === 'ok' ? 200 : 503).send(health);
});

app.get('/api/dashboard', async (request, reply) => {
  try {
    const health = await getHealthPayload();
    if (health.database.status !== 'online') return reply.code(503).send({ health, metrics: null, latestSignals: [], latestTokens: [], activePositions: [], scoreDistribution: [], meta: { generatedAt: new Date().toISOString(), pollIntervalMs: 15000 } });

    const { startWib, endWib } = dayBoundsWib();
    const [signalCounts, riskRows, updatedToday, lastSignal, latestSignals, latestTokens, activePositions, distributionRaw] = await Promise.all([
      query('SELECT `signal`, COUNT(*) AS total FROM tokens GROUP BY `signal`'),
      query("SELECT COUNT(*) AS total FROM tokens WHERE rug_status = 'RISK'"),
      query('SELECT COUNT(*) AS total FROM tokens WHERE last_scanned_at >= ? AND last_scanned_at < ?', [startWib, endWib]),
      query('SELECT MAX(sent_at) AS lastSignalAt FROM signals'),
      query("SELECT s.*, t.symbol, t.name, t.price_usd FROM signals s LEFT JOIN tokens t ON t.id = s.token_id WHERE s.`signal` IN ('BUY','WATCH') ORDER BY s.sent_at DESC LIMIT 8"),
      query('SELECT * FROM tokens ORDER BY last_scanned_at DESC LIMIT 10'),
      query("SELECT * FROM portfolio WHERE `status` = 'ACTIVE' ORDER BY opened_at DESC LIMIT 8"),
      query('SELECT score, COUNT(*) AS total FROM tokens WHERE score IS NOT NULL AND score BETWEEN 0 AND 100 GROUP BY score')
    ]);

    const counts = signalCounts.reduce((acc, row) => ({ ...acc, [row.signal]: Number(row.total) }), {});
    return {
      health: {
        apiStatus: health.api.status,
        databaseStatus: health.database.status,
        serverTime: health.api.serverTime,
        uptimeSeconds: health.api.uptimeSeconds,
        lastScannerActivityAt: health.scanner.lastScannerActivityAt,
        scannerStale: health.scanner.scannerStale,
        scannerStatus: health.scanner.scannerStatus,
        staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
        lastSignalAt: toIso(lastSignal[0]?.lastSignalAt)
      },
      metrics: {
        activePositions: activePositions.length,
        buyTokens: counts.BUY || 0,
        watchTokens: counts.WATCH || 0,
        avoidTokens: counts.AVOID || 0,
        riskTokens: Number(riskRows[0]?.total || 0),
        tokensUpdatedToday: Number(updatedToday[0]?.total || 0)
      },
      latestSignals: latestSignals.map(mapSignal),
      latestTokens: latestTokens.map(mapToken),
      activePositions: activePositions.map(mapPosition),
      scoreDistribution: scoreDistributionRows(distributionRaw),
      meta: {
        generatedAt: new Date().toISOString(),
        pollIntervalMs: 15000,
        dataMode: 'latest_snapshot',
        tokensUpdatedTodayTimezone: 'Asia/Jakarta'
      }
    };
  } catch (error) {
    request.log.error(error);
    return sendError(reply, 500, 'DATABASE_ERROR', 'Failed to load dashboard data');
  }
});

app.get('/api/tokens', async (request, reply) => {
  try {
    const { page, limit } = parsePagination(request.query);
    const order = parseOrder(request.query.order);
    const sort = parseSort(request.query.sort, tokenSorts, 'lastScannedAt');
    const signal = parseEnum(request.query.signal, SIGNALS, 'signal');
    const rugStatus = parseEnum(request.query.rugStatus, RUG_STATUSES, 'rugStatus');
    const minScore = parseMinScore(request.query.minScore);
    const search = request.query.search ? String(request.query.search).trim() : null;
    const where = [];
    const params = [];

    if (search) {
      where.push('(symbol LIKE ? OR name LIKE ? OR token_address LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (signal) { where.push('`signal` = ?'); params.push(signal); }
    if (rugStatus) { where.push('rug_status = ?'); params.push(rugStatus); }
    if (minScore !== null) { where.push('score >= ?'); params.push(minScore); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query(`SELECT COUNT(*) AS total FROM tokens ${whereSql}`, params);
    const total = Number(countRows[0]?.total || 0);
    const offset = (page - 1) * limit;
    const rows = await query(`SELECT * FROM tokens ${whereSql} ORDER BY ${sort.sql} ${order.toUpperCase()} LIMIT ? OFFSET ?`, [...params, limit, offset]);

    return {
      data: rows.map(mapToken),
      pagination: paginationMeta(total, page, limit),
      filters: { search, signal, minScore, rugStatus, sort: sort.key, order },
      meta: { generatedAt: new Date().toISOString() }
    };
  } catch (error) {
    if (error.field) return sendError(reply, 400, 'INVALID_QUERY', error.message, { field: error.field });
    request.log.error(error);
    return sendError(reply, 500, 'DATABASE_ERROR', 'Failed to load tokens');
  }
});

app.get('/api/tokens/:address', async (request, reply) => {
  try {
    const address = parseAddress(request.params.address);
    const rows = await query('SELECT * FROM tokens WHERE token_address = ? LIMIT 1', [address]);
    if (rows.length === 0) return sendError(reply, 404, 'TOKEN_NOT_FOUND', 'Token not found');
    return { data: mapToken(rows[0]), meta: { generatedAt: new Date().toISOString() } };
  } catch (error) {
    if (error.field) return sendError(reply, 400, 'INVALID_TOKEN_ADDRESS', error.message, { field: error.field });
    request.log.error(error);
    return sendError(reply, 500, 'DATABASE_ERROR', 'Failed to load token');
  }
});

app.get('/api/portfolio', async (request, reply) => {
  try {
    const { page, limit } = parsePagination(request.query);
    const order = parseOrder(request.query.order);
    const sort = parseSort(request.query.sort, portfolioSorts, 'openedAt');
    const status = parseEnum(request.query.status, PORTFOLIO_STATUSES, 'status');
    const whereSql = status ? 'WHERE `status` = ?' : '';
    const params = status ? [status] : [];
    const countRows = await query(`SELECT COUNT(*) AS total FROM portfolio ${whereSql}`, params);
    const total = Number(countRows[0]?.total || 0);
    const offset = (page - 1) * limit;
    const rows = await query(`SELECT * FROM portfolio ${whereSql} ORDER BY ${sort.sql} ${order.toUpperCase()} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { data: rows.map(mapPosition), pagination: paginationMeta(total, page, limit), filters: { status, sort: sort.key, order }, meta: { generatedAt: new Date().toISOString() } };
  } catch (error) {
    if (error.field) return sendError(reply, 400, 'INVALID_QUERY', error.message, { field: error.field });
    request.log.error(error);
    return sendError(reply, 500, 'DATABASE_ERROR', 'Failed to load portfolio');
  }
});

app.get('/api/signals', async (request, reply) => {
  try {
    const { page, limit } = parsePagination(request.query);
    const order = parseOrder(request.query.order);
    const sort = parseSort(request.query.sort, signalSorts, 'sentAt');
    const signal = parseEnum(request.query.signal, SIGNALS, 'signal');
    const search = request.query.search ? String(request.query.search).trim() : null;
    const where = [];
    const params = [];
    if (signal) { where.push('s.`signal` = ?'); params.push(signal); }
    if (search) {
      where.push('(t.symbol LIKE ? OR t.name LIKE ? OR s.token_address LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await query(`SELECT COUNT(*) AS total FROM signals s LEFT JOIN tokens t ON t.id = s.token_id ${whereSql}`, params);
    const total = Number(countRows[0]?.total || 0);
    const offset = (page - 1) * limit;
    const rows = await query(`SELECT s.*, t.symbol, t.name, t.price_usd AS current_token_price FROM signals s LEFT JOIN tokens t ON t.id = s.token_id ${whereSql} ORDER BY ${sort.sql} ${order.toUpperCase()} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { data: rows.map(mapSignal), pagination: paginationMeta(total, page, limit), filters: { signal, search, sort: sort.key, order }, meta: { generatedAt: new Date().toISOString(), telegramStatusAvailable: false } };
  } catch (error) {
    if (error.field) return sendError(reply, 400, 'INVALID_QUERY', error.message, { field: error.field });
    request.log.error(error);
    return sendError(reply, 500, 'DATABASE_ERROR', 'Failed to load signals');
  }
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
