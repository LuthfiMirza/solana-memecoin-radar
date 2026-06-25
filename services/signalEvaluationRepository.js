const { query } = require('../config/db');
const { signalEvaluationConfig } = require('../config/strategy');
const { evaluateEligibility } = require('./signal-performance/calculations');

function toMysqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function mapEvaluation(row) {
  return {
    id: row.id,
    signalId: row.signal_id,
    tokenId: row.token_id,
    tokenAddress: row.token_address,
    signalType: row.signal_type,
    entryPrice: row.entry_price,
    signalScore: row.signal_score,
    rugStatusAtSignal: row.rug_status_at_signal,
    liquidityAtSignal: row.liquidity_at_signal,
    topHolderPercentAtSignal: row.top_holder_percent_at_signal,
    buySellRatioAtSignal: row.buy_sell_ratio_at_signal,
    signalCreatedAt: row.signal_created_at,
    price15m: row.price_15m,
    price1h: row.price_1h,
    price6h: row.price_6h,
    price24h: row.price_24h,
    return15mPercent: row.return_15m_percent,
    return1hPercent: row.return_1h_percent,
    return6hPercent: row.return_6h_percent,
    return24hPercent: row.return_24h_percent,
    maxPrice: row.max_price,
    minPrice: row.min_price,
    maxReturnPercent: row.max_return_percent,
    maxDrawdownPercent: row.max_drawdown_percent,
    maxPriceAt: row.max_price_at,
    minPriceAt: row.min_price_at,
    tp20HitAt: row.tp_20_hit_at,
    sl10HitAt: row.sl_10_hit_at,
    firstExitEvent: row.first_exit_event,
    firstExitEventAt: row.first_exit_event_at,
    outcome: row.outcome,
    evaluationStatus: row.evaluation_status,
    dataQuality: row.data_quality,
    eligibleForStrategy: Boolean(row.eligible_for_strategy),
    rejectionReasons: parseJson(row.rejection_reasons),
    completedAt: row.completed_at,
    lastCheckedAt: row.last_checked_at
  };
}

function mapSnapshot(row) {
  return {
    id: row.id,
    signalId: row.signal_id,
    tokenAddress: row.token_address,
    priceUsd: row.price_usd,
    capturedAt: row.captured_at,
    capturedBucket: row.captured_bucket,
    source: row.source,
    providerStatus: row.provider_status
  };
}

async function createEvaluationForSignal(signal, config = signalEvaluationConfig) {
  const eligibility = evaluateEligibility({
    signalType: signal.signal,
    signalScore: signal.score,
    rugStatusAtSignal: signal.rugStatus,
    liquidityAtSignal: signal.liquidityUsd,
    topHolderPercentAtSignal: signal.topHolderPercent,
    buySellRatioAtSignal: signal.buySellRatio
  }, config);
  const entryPrice = signal.priceAtSignal ?? signal.priceUsd ?? null;
  const status = entryPrice === null || entryPrice === undefined || Number(entryPrice) <= 0 ? 'INSUFFICIENT_DATA' : 'PENDING';
  const outcome = status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'PENDING';
  const dataQuality = status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT' : 'PARTIAL';

  await query(
    `INSERT INTO signal_evaluations
      (signal_id, token_id, token_address, signal_type, entry_price, signal_score, rug_status_at_signal,
       liquidity_at_signal, top_holder_percent_at_signal, buy_sell_ratio_at_signal, signal_created_at,
       outcome, evaluation_status, data_quality, eligible_for_strategy, rejection_reasons)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE signal_id = signal_id`,
    [
      signal.signalId,
      signal.tokenId || null,
      signal.tokenAddress,
      signal.signal,
      entryPrice,
      signal.score,
      signal.rugStatus || null,
      signal.liquidityUsd ?? null,
      signal.topHolderPercent ?? null,
      signal.buySellRatio ?? null,
      toMysqlDate(signal.sentAt || new Date()),
      outcome,
      status,
      dataQuality,
      eligibility.eligible ? 1 : 0,
      JSON.stringify(eligibility.rejectionReasons)
    ]
  );

  const rows = await query('SELECT * FROM signal_evaluations WHERE signal_id = ? LIMIT 1', [signal.signalId]);
  return rows[0] ? mapEvaluation(rows[0]) : null;
}

async function fetchPendingEvaluations({ limit = signalEvaluationConfig.batchSize } = {}) {
  const rows = await query(
    `SELECT * FROM signal_evaluations
     WHERE evaluation_status IN ('PENDING', 'IN_PROGRESS')
     ORDER BY COALESCE(last_checked_at, signal_created_at) ASC, signal_created_at ASC
     LIMIT ?`,
    [Number(limit)]
  );
  return rows.map(mapEvaluation);
}

async function insertSnapshot({ signalId, tokenAddress, priceUsd, capturedAt, capturedBucket, source = 'dexscreener_latest', providerStatus = 'OK' }) {
  const result = await query(
    `INSERT INTO signal_price_snapshots
      (signal_id, token_address, price_usd, captured_at, captured_bucket, source, provider_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [signalId, tokenAddress, priceUsd, toMysqlDate(capturedAt), toMysqlDate(capturedBucket), source, providerStatus]
  );
  return { inserted: result.affectedRows === 1 };
}

async function fetchOrderedValidSnapshots(signalId) {
  const rows = await query(
    `SELECT * FROM signal_price_snapshots
     WHERE signal_id = ? AND provider_status = 'OK' AND price_usd IS NOT NULL
     ORDER BY captured_at ASC`,
    [signalId]
  );
  return rows.map(mapSnapshot);
}

async function markChecked(evaluationId, checkedAt = new Date()) {
  await query('UPDATE signal_evaluations SET last_checked_at = ?, evaluation_status = IF(evaluation_status = \'PENDING\', \'IN_PROGRESS\', evaluation_status) WHERE id = ?', [toMysqlDate(checkedAt), evaluationId]);
}

async function updateEvaluationMetrics(evaluationId, metrics) {
  await query(
    `UPDATE signal_evaluations SET
      price_15m = COALESCE(price_15m, ?), return_15m_percent = COALESCE(return_15m_percent, ?),
      price_1h = COALESCE(price_1h, ?), return_1h_percent = COALESCE(return_1h_percent, ?),
      price_6h = COALESCE(price_6h, ?), return_6h_percent = COALESCE(return_6h_percent, ?),
      price_24h = COALESCE(price_24h, ?), return_24h_percent = COALESCE(return_24h_percent, ?),
      max_price = ?, min_price = ?, max_return_percent = ?, max_drawdown_percent = ?,
      max_price_at = ?, min_price_at = ?, tp_20_hit_at = ?, sl_10_hit_at = ?,
      first_exit_event = ?, first_exit_event_at = ?, outcome = ?, evaluation_status = ?, data_quality = ?,
      completed_at = ?, last_checked_at = ?
     WHERE id = ?`,
    [
      metrics.price15m ?? null,
      metrics.return15mPercent ?? null,
      metrics.price1h ?? null,
      metrics.return1hPercent ?? null,
      metrics.price6h ?? null,
      metrics.return6hPercent ?? null,
      metrics.price24h ?? null,
      metrics.return24hPercent ?? null,
      metrics.maxPrice ?? null,
      metrics.minPrice ?? null,
      metrics.maxReturnPercent ?? null,
      metrics.maxDrawdownPercent ?? null,
      toMysqlDate(metrics.maxPriceAt),
      toMysqlDate(metrics.minPriceAt),
      toMysqlDate(metrics.tp20HitAt),
      toMysqlDate(metrics.sl10HitAt),
      metrics.firstExitEvent ?? null,
      toMysqlDate(metrics.firstExitEventAt),
      metrics.outcome || 'PENDING',
      metrics.evaluationStatus || 'IN_PROGRESS',
      metrics.dataQuality || 'PARTIAL',
      toMysqlDate(metrics.completedAt),
      toMysqlDate(metrics.lastCheckedAt || new Date()),
      evaluationId
    ]
  );
}

async function updateEvaluationStatus(evaluationId, { evaluationStatus, outcome, dataQuality, lastCheckedAt = new Date(), completedAt = null }) {
  await query(
    `UPDATE signal_evaluations
     SET evaluation_status = ?, outcome = ?, data_quality = ?, last_checked_at = ?, completed_at = ?
     WHERE id = ?`,
    [evaluationStatus, outcome, dataQuality, toMysqlDate(lastCheckedAt), toMysqlDate(completedAt), evaluationId]
  );
}

function parseJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

module.exports = {
  toMysqlDate,
  mapEvaluation,
  createEvaluationForSignal,
  fetchPendingEvaluations,
  insertSnapshot,
  fetchOrderedValidSnapshots,
  markChecked,
  updateEvaluationMetrics,
  updateEvaluationStatus
};
