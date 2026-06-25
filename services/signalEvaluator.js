const { getTokenData } = require('./pairLookup');
const repository = require('./signalEvaluationRepository');
const { signalEvaluationConfig } = require('../config/strategy');
const {
  applyMilestones,
  determineCompletion,
  evaluateTpSlFromSnapshots,
  floorToBucket,
  parseDecimal,
  updateExtremes
} = require('./signal-performance/calculations');

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function evaluatePendingSignals(options = {}) {
  const config = { ...signalEvaluationConfig, ...options.config };
  if (!config.enabled && !options.force) return { skipped: true, reason: 'DISABLED', evaluations: 0, tokens: 0, success: 0, errors: 0 };

  const evaluations = await repository.fetchPendingEvaluations({ limit: options.limit || config.batchSize });
  const grouped = groupByToken(evaluations);
  const tokenAddresses = Object.keys(grouped);
  const now = options.now ? new Date(options.now) : new Date();
  let success = 0;
  let errors = 0;

  await runWithConcurrency(tokenAddresses, config.concurrency, async (tokenAddress) => {
    let providerResult;
    try {
      const pair = await getTokenData(tokenAddress);
      if (!pair) providerResult = { priceUsd: null, providerStatus: 'NOT_FOUND' };
      else if (parseDecimal(pair.priceUsd) === null || parseDecimal(pair.priceUsd) <= 0) providerResult = { priceUsd: null, providerStatus: 'PRICE_NULL' };
      else providerResult = { priceUsd: pair.priceUsd, providerStatus: 'OK' };
    } catch (error) {
      providerResult = { priceUsd: null, providerStatus: 'ERROR', error };
    }

    for (const evaluation of grouped[tokenAddress]) {
      try {
        await evaluateSignal(evaluation, { config, providerResult, now });
        success += 1;
      } catch (error) {
        errors += 1;
        console.warn(`Signal evaluator failed for signal ${evaluation.signalId}: ${error.message}`);
        await repository.updateEvaluationStatus(evaluation.id, {
          evaluationStatus: evaluation.evaluationStatus || 'IN_PROGRESS',
          outcome: evaluation.outcome || 'PENDING',
          dataQuality: evaluation.dataQuality || 'PARTIAL',
          lastCheckedAt: now
        }).catch(() => null);
      }
    }
  });

  return { evaluations: evaluations.length, tokens: tokenAddresses.length, success, errors };
}

async function evaluateSignal(evaluation, { config = signalEvaluationConfig, providerResult, now = new Date() } = {}) {
  await repository.markChecked(evaluation.id, now);

  if (parseDecimal(evaluation.entryPrice) === null || parseDecimal(evaluation.entryPrice) <= 0) {
    await repository.updateEvaluationStatus(evaluation.id, {
      evaluationStatus: 'INSUFFICIENT_DATA',
      outcome: 'INSUFFICIENT_DATA',
      dataQuality: 'INSUFFICIENT',
      lastCheckedAt: now,
      completedAt: now
    });
    return { status: 'INSUFFICIENT_DATA', reason: 'MISSING_ENTRY_PRICE' };
  }

  const bucket = floorToBucket(now, config.evaluatorIntervalMinutes);
  await repository.insertSnapshot({
    signalId: evaluation.signalId,
    tokenAddress: evaluation.tokenAddress,
    priceUsd: providerResult?.providerStatus === 'OK' ? providerResult.priceUsd : null,
    capturedAt: now,
    capturedBucket: bucket,
    providerStatus: providerResult?.providerStatus || 'ERROR'
  });

  const snapshots = await repository.fetchOrderedValidSnapshots(evaluation.signalId);
  let metrics = normalizeEvaluationMetrics(evaluation);

  for (const snapshot of snapshots) {
    metrics = updateExtremes(metrics, snapshot, evaluation.entryPrice);
  }
  metrics = applyMilestones(metrics, snapshots, evaluation.signalCreatedAt, evaluation.entryPrice);
  metrics = evaluateTpSlFromSnapshots(metrics, snapshots, evaluation.entryPrice, config);

  const completion = determineCompletion(metrics, snapshots, now, config);
  metrics = {
    ...metrics,
    ...completion,
    lastCheckedAt: now,
    completedAt: ['COMPLETED', 'INSUFFICIENT_DATA', 'FAILED'].includes(completion.evaluationStatus) ? now : null
  };

  await repository.updateEvaluationMetrics(evaluation.id, metrics);
  return { status: metrics.evaluationStatus, outcome: metrics.outcome };
}

async function runSignalEvaluatorOnce(options = {}) {
  const result = await evaluatePendingSignals({ ...options, force: true });
  console.log(`Signal evaluator once: evaluations=${result.evaluations || 0}, tokens=${result.tokens || 0}, success=${result.success || 0}, errors=${result.errors || 0}`);
  return result;
}

function groupByToken(evaluations) {
  return evaluations.reduce((groups, evaluation) => {
    if (!groups[evaluation.tokenAddress]) groups[evaluation.tokenAddress] = [];
    groups[evaluation.tokenAddress].push(evaluation);
    return groups;
  }, {});
}

function normalizeEvaluationMetrics(evaluation) {
  return {
    price15m: evaluation.price15m ?? null,
    price1h: evaluation.price1h ?? null,
    price6h: evaluation.price6h ?? null,
    price24h: evaluation.price24h ?? null,
    return15mPercent: evaluation.return15mPercent ?? null,
    return1hPercent: evaluation.return1hPercent ?? null,
    return6hPercent: evaluation.return6hPercent ?? null,
    return24hPercent: evaluation.return24hPercent ?? null,
    maxPrice: evaluation.maxPrice ?? null,
    minPrice: evaluation.minPrice ?? null,
    maxReturnPercent: evaluation.maxReturnPercent ?? null,
    maxDrawdownPercent: evaluation.maxDrawdownPercent ?? null,
    maxPriceAt: evaluation.maxPriceAt ?? null,
    minPriceAt: evaluation.minPriceAt ?? null,
    tp20HitAt: evaluation.tp20HitAt ?? null,
    sl10HitAt: evaluation.sl10HitAt ?? null,
    firstExitEvent: evaluation.firstExitEvent ?? null,
    firstExitEventAt: evaluation.firstExitEventAt ?? null,
    outcome: evaluation.outcome || 'PENDING',
    evaluationStatus: evaluation.evaluationStatus || 'PENDING',
    dataQuality: evaluation.dataQuality || 'PARTIAL',
    entryPrice: evaluation.entryPrice,
    signalCreatedAt: evaluation.signalCreatedAt
  };
}

module.exports = {
  evaluatePendingSignals,
  evaluateSignal,
  runSignalEvaluatorOnce,
  runWithConcurrency
};
