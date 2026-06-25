function readNumber(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function readList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const signalEvaluationConfig = {
  enabled: readBoolean('SIGNAL_EVALUATOR_ENABLED', true),
  evaluatorIntervalMinutes: readNumber('SIGNAL_EVALUATOR_INTERVAL_MINUTES', 2),
  evaluationDurationHours: readNumber('SIGNAL_EVALUATION_DURATION_HOURS', 24),
  batchSize: readNumber('SIGNAL_EVALUATOR_BATCH_SIZE', 25),
  concurrency: readNumber('SIGNAL_EVALUATOR_CONCURRENCY', 3),
  providerTimeoutMs: readNumber('SIGNAL_EVALUATOR_PROVIDER_TIMEOUT_MS', 20000),
  takeProfitPercent: readNumber('SIGNAL_EVALUATION_TAKE_PROFIT_PERCENT', 20),
  stopLossPercent: readNumber('SIGNAL_EVALUATION_STOP_LOSS_PERCENT', 10),
  minimumScore: readNumber('SIGNAL_STRATEGY_MINIMUM_SCORE', 80),
  allowedRugStatuses: readList('SIGNAL_STRATEGY_ALLOWED_RUG_STATUSES', ['SAFE']),
  minimumLiquidityUsd: readNumber('SIGNAL_STRATEGY_MINIMUM_LIQUIDITY_USD', 50000),
  maximumTopHolderPercent: readNumber('SIGNAL_STRATEGY_MAX_TOP_HOLDER_PERCENT', 10),
  minimumBuySellRatio: readNumber('SIGNAL_STRATEGY_MIN_BUY_SELL_RATIO', 1.2)
};

module.exports = { signalEvaluationConfig };
