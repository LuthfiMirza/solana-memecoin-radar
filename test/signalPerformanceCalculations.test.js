const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDecimal,
  calculateReturnPercent,
  calculateThresholdPrices,
  floorToBucket,
  evaluateEligibility,
  updateExtremes,
  applyMilestones,
  evaluateTpSlFromSnapshots,
  determineCompletion
} = require('../services/signal-performance/calculations');

const config = {
  takeProfitPercent: 20,
  stopLossPercent: 10,
  evaluationDurationHours: 24,
  minimumScore: 80,
  allowedRugStatuses: ['SAFE'],
  minimumLiquidityUsd: 50000,
  maximumTopHolderPercent: 10,
  minimumBuySellRatio: 1.2
};

test('parseDecimal handles valid and invalid values', () => {
  assert.equal(parseDecimal('0.00000123'), 0.00000123);
  assert.equal(parseDecimal(12.34), 12.34);
  assert.equal(parseDecimal(null), null);
  assert.equal(parseDecimal(undefined), null);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal(Number.NaN), null);
  assert.equal(parseDecimal(Number.POSITIVE_INFINITY), null);
  assert.equal(parseDecimal(0), 0);
  assert.equal(parseDecimal(-1), -1);
});

test('calculateReturnPercent handles positive negative zero and tiny prices', () => {
  assert.equal(calculateReturnPercent(120, 100), 20);
  assert.equal(calculateReturnPercent(90, 100), -10);
  assert.equal(calculateReturnPercent(100, 100), 0);
  assert.ok(Math.abs(calculateReturnPercent(0.0000012, 0.000001) - 20) < 0.000001);
  assert.equal(calculateReturnPercent(100, 0), null);
  assert.equal(calculateReturnPercent(null, 100), null);
});

test('floorToBucket uses UTC two-minute buckets', () => {
  assert.equal(floorToBucket('2026-06-25T10:00:00.000Z', 2).toISOString(), '2026-06-25T10:00:00.000Z');
  assert.equal(floorToBucket('2026-06-25T10:01:59.000Z', 2).toISOString(), '2026-06-25T10:00:00.000Z');
  assert.equal(floorToBucket('2026-06-25T10:02:00.000Z', 2).toISOString(), '2026-06-25T10:02:00.000Z');
  assert.equal(floorToBucket('2026-06-25T10:03:40.000Z', 2).toISOString(), '2026-06-25T10:02:00.000Z');
});

test('evaluateEligibility accepts eligible BUY and rejects invalid reasons', () => {
  assert.deepEqual(evaluateEligibility({ signal: 'BUY', score: 80, rugStatus: 'SAFE', liquidityUsd: 50000, topHolderPercent: 10, buySellRatio: 1.2 }, config), { eligible: true, rejectionReasons: [] });
  assert.deepEqual(evaluateEligibility({ signal: 'WATCH', score: 70, rugStatus: 'RISK', liquidityUsd: 100, topHolderPercent: 40, buySellRatio: 0.5 }, config), {
    eligible: false,
    rejectionReasons: ['SIGNAL_NOT_BUY', 'SCORE_BELOW_MINIMUM', 'RUG_STATUS_NOT_SAFE', 'LOW_LIQUIDITY', 'TOP_HOLDER_TOO_HIGH', 'BUY_SELL_RATIO_TOO_LOW']
  });
  assert.deepEqual(evaluateEligibility({ signal: 'BUY', score: null, rugStatus: null, liquidityUsd: null, topHolderPercent: null, buySellRatio: null }, config).rejectionReasons, ['MISSING_REQUIRED_DATA']);
});

test('calculateThresholdPrices returns TP and SL', () => {
  assert.deepEqual(calculateThresholdPrices(100, config), { tpPrice: 120, slPrice: 90 });
  assert.deepEqual(calculateThresholdPrices(0, config), { tpPrice: null, slPrice: null });
});

test('evaluateTpSlFromSnapshots detects TP first SL first and neither', () => {
  const base = { tp20HitAt: null, sl10HitAt: null, outcome: 'PENDING' };
  const tpFirst = evaluateTpSlFromSnapshots(base, [{ priceUsd: 121, capturedAt: '2026-06-25T00:01:00Z' }, { priceUsd: 89, capturedAt: '2026-06-25T00:02:00Z' }], 100, config);
  assert.equal(tpFirst.outcome, 'TP_BEFORE_SL');
  const slFirst = evaluateTpSlFromSnapshots(base, [{ priceUsd: 89, capturedAt: '2026-06-25T00:01:00Z' }, { priceUsd: 121, capturedAt: '2026-06-25T00:02:00Z' }], 100, config);
  assert.equal(slFirst.outcome, 'SL_BEFORE_TP');
  const neither = evaluateTpSlFromSnapshots(base, [{ priceUsd: 100, capturedAt: '2026-06-25T00:01:00Z' }], 100, config);
  assert.equal(neither.outcome, 'PENDING');
  const missing = evaluateTpSlFromSnapshots(base, [{ priceUsd: null, capturedAt: '2026-06-25T00:01:00Z' }], 100, config);
  assert.equal(missing.outcome, 'PENDING');
});

test('applyMilestones uses first valid snapshot after threshold and does not overwrite', () => {
  const snapshots = [
    { priceUsd: 101, capturedAt: '2026-06-25T00:14:00Z' },
    { priceUsd: 102, capturedAt: '2026-06-25T00:16:00Z' },
    { priceUsd: 110, capturedAt: '2026-06-25T01:00:00Z' }
  ];
  const result = applyMilestones({ price15m: null, price1h: null }, snapshots, '2026-06-25T00:00:00Z', 100);
  assert.equal(result.price15m, 102);
  assert.equal(result.return15mPercent, 2);
  assert.equal(result.price1h, 110);
  const unchanged = applyMilestones({ price15m: 999 }, snapshots, '2026-06-25T00:00:00Z', 100);
  assert.equal(unchanged.price15m, 999);
});

test('updateExtremes tracks first max min and ignores invalid snapshots', () => {
  let current = updateExtremes({}, { priceUsd: 100, capturedAt: '2026-06-25T00:00:00Z' }, 100);
  assert.equal(current.maxPrice, 100);
  assert.equal(current.minPrice, 100);
  current = updateExtremes(current, { priceUsd: 130, capturedAt: '2026-06-25T00:02:00Z' }, 100);
  assert.equal(current.maxReturnPercent, 30);
  current = updateExtremes(current, { priceUsd: 85, capturedAt: '2026-06-25T00:04:00Z' }, 100);
  assert.equal(current.maxDrawdownPercent, -15);
  const unchanged = updateExtremes(current, { priceUsd: null, capturedAt: '2026-06-25T00:06:00Z' }, 100);
  assert.equal(unchanged.maxPrice, 130);
});

test('determineCompletion handles pending complete and insufficient states', () => {
  assert.equal(determineCompletion({ entryPrice: 100, signalCreatedAt: '2026-06-25T00:00:00Z', outcome: 'PENDING' }, [{ priceUsd: 100 }], '2026-06-25T23:00:00Z', config).evaluationStatus, 'IN_PROGRESS');
  const noExit = determineCompletion({ entryPrice: 100, signalCreatedAt: '2026-06-25T00:00:00Z', outcome: 'PENDING' }, [{ priceUsd: 100 }], '2026-06-26T00:01:00Z', config);
  assert.equal(noExit.evaluationStatus, 'COMPLETED');
  assert.equal(noExit.outcome, 'NO_EXIT_24H');
  assert.equal(determineCompletion({ entryPrice: null, signalCreatedAt: '2026-06-25T00:00:00Z' }, [], '2026-06-26T00:01:00Z', config).evaluationStatus, 'INSUFFICIENT_DATA');
  assert.equal(determineCompletion({ entryPrice: 100, signalCreatedAt: '2026-06-25T00:00:00Z' }, [], '2026-06-26T00:01:00Z', config).evaluationStatus, 'INSUFFICIENT_DATA');
});
