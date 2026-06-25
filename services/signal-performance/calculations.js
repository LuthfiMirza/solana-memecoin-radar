const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

function parseDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateReturnPercent(currentPrice, entryPrice) {
  const current = parseDecimal(currentPrice);
  const entry = parseDecimal(entryPrice);
  if (current === null || entry === null || entry <= 0) return null;
  const result = ((current - entry) / entry) * 100;
  return Number.isFinite(result) ? result : null;
}

function calculateThresholdPrices(entryPrice, config) {
  const entry = parseDecimal(entryPrice);
  if (entry === null || entry <= 0) return { tpPrice: null, slPrice: null };
  return {
    tpPrice: entry * (1 + Number(config.takeProfitPercent) / 100),
    slPrice: entry * (1 - Number(config.stopLossPercent) / 100)
  };
}

function floorToBucket(dateInput, intervalMinutes = 2) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

function isValidPrice(value) {
  const price = parseDecimal(value);
  return price !== null && price > 0;
}

function evaluateEligibility(signal, config) {
  const reasons = [];
  const score = parseDecimal(signal.signalScore ?? signal.score);
  const liquidity = parseDecimal(signal.liquidityAtSignal ?? signal.liquidityUsd);
  const topHolder = parseDecimal(signal.topHolderPercentAtSignal ?? signal.topHolderPercent);
  const buySellRatio = parseDecimal(signal.buySellRatioAtSignal ?? signal.buySellRatio);
  const rugStatus = signal.rugStatusAtSignal ?? signal.rugStatus;
  const signalType = signal.signalType ?? signal.signal;

  if (signalType !== 'BUY') reasons.push('SIGNAL_NOT_BUY');
  if (score === null || liquidity === null || topHolder === null || buySellRatio === null || !rugStatus) {
    reasons.push('MISSING_REQUIRED_DATA');
  }
  if (score !== null && score < config.minimumScore) reasons.push('SCORE_BELOW_MINIMUM');
  if (rugStatus && !config.allowedRugStatuses.includes(rugStatus)) reasons.push('RUG_STATUS_NOT_SAFE');
  if (liquidity !== null && liquidity < config.minimumLiquidityUsd) reasons.push('LOW_LIQUIDITY');
  if (topHolder !== null && topHolder > config.maximumTopHolderPercent) reasons.push('TOP_HOLDER_TOO_HIGH');
  if (buySellRatio !== null && buySellRatio < config.minimumBuySellRatio) reasons.push('BUY_SELL_RATIO_TOO_LOW');

  return { eligible: reasons.length === 0, rejectionReasons: [...new Set(reasons)] };
}

function updateExtremes(current, snapshot, entryPrice) {
  if (!isValidPrice(snapshot.priceUsd)) return current;
  const price = parseDecimal(snapshot.priceUsd);
  const capturedAt = normalizeDate(snapshot.capturedAt ?? snapshot.captured_at);
  const returnPercent = calculateReturnPercent(price, entryPrice);
  const next = { ...current };
  if (next.maxPrice === null || next.maxPrice === undefined || price > Number(next.maxPrice)) {
    next.maxPrice = price;
    next.maxPriceAt = capturedAt;
    next.maxReturnPercent = returnPercent;
  }
  if (next.minPrice === null || next.minPrice === undefined || price < Number(next.minPrice)) {
    next.minPrice = price;
    next.minPriceAt = capturedAt;
    next.maxDrawdownPercent = returnPercent;
  }
  return next;
}

function applyMilestones(current, snapshots, signalCreatedAt, entryPrice) {
  const createdAt = new Date(signalCreatedAt);
  const milestones = [
    { priceKey: 'price15m', returnKey: 'return15mPercent', offsetMs: 15 * MS_PER_MINUTE },
    { priceKey: 'price1h', returnKey: 'return1hPercent', offsetMs: MS_PER_HOUR },
    { priceKey: 'price6h', returnKey: 'return6hPercent', offsetMs: 6 * MS_PER_HOUR },
    { priceKey: 'price24h', returnKey: 'return24hPercent', offsetMs: 24 * MS_PER_HOUR }
  ];
  const next = { ...current };
  if (Number.isNaN(createdAt.getTime())) return next;
  const ordered = [...snapshots].filter((snapshot) => isValidPrice(snapshot.priceUsd)).sort(compareSnapshots);
  for (const milestone of milestones) {
    if (next[milestone.priceKey] !== null && next[milestone.priceKey] !== undefined) continue;
    const target = createdAt.getTime() + milestone.offsetMs;
    const hit = ordered.find((snapshot) => new Date(snapshot.capturedAt ?? snapshot.captured_at).getTime() >= target);
    if (!hit) continue;
    next[milestone.priceKey] = parseDecimal(hit.priceUsd);
    next[milestone.returnKey] = calculateReturnPercent(hit.priceUsd, entryPrice);
  }
  return next;
}

function evaluateTpSlFromSnapshots(existing, snapshots, entryPrice, config) {
  const { tpPrice, slPrice } = calculateThresholdPrices(entryPrice, config);
  const next = { ...existing };
  if (tpPrice === null || slPrice === null) return next;
  const ordered = [...snapshots].filter((snapshot) => isValidPrice(snapshot.priceUsd)).sort(compareSnapshots);
  for (const snapshot of ordered) {
    const price = parseDecimal(snapshot.priceUsd);
    const capturedAt = normalizeDate(snapshot.capturedAt ?? snapshot.captured_at);
    if (!next.tp20HitAt && price >= tpPrice) next.tp20HitAt = capturedAt;
    if (!next.sl10HitAt && price <= slPrice) next.sl10HitAt = capturedAt;
  }
  return determineFirstExit(next);
}

function determineFirstExit(evaluation) {
  const next = { ...evaluation };
  const tpTime = next.tp20HitAt ? new Date(next.tp20HitAt).getTime() : null;
  const slTime = next.sl10HitAt ? new Date(next.sl10HitAt).getTime() : null;
  if (tpTime !== null && slTime !== null) {
    if (tpTime < slTime) {
      next.firstExitEvent = 'TP_20';
      next.firstExitEventAt = normalizeDate(next.tp20HitAt);
      next.outcome = 'TP_BEFORE_SL';
    } else if (slTime < tpTime) {
      next.firstExitEvent = 'SL_10';
      next.firstExitEventAt = normalizeDate(next.sl10HitAt);
      next.outcome = 'SL_BEFORE_TP';
    } else {
      next.firstExitEvent = 'AMBIGUOUS';
      next.firstExitEventAt = normalizeDate(next.tp20HitAt);
      next.outcome = 'AMBIGUOUS';
    }
  } else if (tpTime !== null) {
    next.firstExitEvent = 'TP_20';
    next.firstExitEventAt = normalizeDate(next.tp20HitAt);
    next.outcome = 'TP_BEFORE_SL';
  } else if (slTime !== null) {
    next.firstExitEvent = 'SL_10';
    next.firstExitEventAt = normalizeDate(next.sl10HitAt);
    next.outcome = 'SL_BEFORE_TP';
  }
  return next;
}

function determineCompletion(evaluation, snapshots, now, config) {
  const entry = parseDecimal(evaluation.entryPrice);
  const createdAt = new Date(evaluation.signalCreatedAt);
  const validSnapshots = snapshots.filter((snapshot) => isValidPrice(snapshot.priceUsd));
  if (entry === null || entry <= 0) return { evaluationStatus: 'INSUFFICIENT_DATA', outcome: 'INSUFFICIENT_DATA', dataQuality: 'INSUFFICIENT' };
  if (Number.isNaN(createdAt.getTime())) return { evaluationStatus: 'FAILED', outcome: 'INSUFFICIENT_DATA', dataQuality: 'INSUFFICIENT' };
  const ageMs = new Date(now).getTime() - createdAt.getTime();
  if (ageMs < config.evaluationDurationHours * MS_PER_HOUR) return { evaluationStatus: 'IN_PROGRESS', outcome: evaluation.outcome || 'PENDING', dataQuality: validSnapshots.length ? 'PARTIAL' : 'PARTIAL' };
  if (validSnapshots.length === 0) return { evaluationStatus: 'INSUFFICIENT_DATA', outcome: 'INSUFFICIENT_DATA', dataQuality: 'INSUFFICIENT' };
  if (evaluation.outcome === 'TP_BEFORE_SL' || evaluation.outcome === 'SL_BEFORE_TP' || evaluation.outcome === 'AMBIGUOUS') {
    return { evaluationStatus: 'COMPLETED', outcome: evaluation.outcome, dataQuality: evaluation.outcome === 'AMBIGUOUS' ? 'AMBIGUOUS' : dataQualityForMilestones(evaluation) };
  }
  return { evaluationStatus: 'COMPLETED', outcome: 'NO_EXIT_24H', dataQuality: dataQualityForMilestones(evaluation) };
}

function dataQualityForMilestones(evaluation) {
  return evaluation.price15m !== null && evaluation.price15m !== undefined
    && evaluation.price1h !== null && evaluation.price1h !== undefined
    && evaluation.price6h !== null && evaluation.price6h !== undefined
    && evaluation.price24h !== null && evaluation.price24h !== undefined
    ? 'COMPLETE'
    : 'PARTIAL';
}

function compareSnapshots(a, b) {
  return new Date(a.capturedAt ?? a.captured_at).getTime() - new Date(b.capturedAt ?? b.captured_at).getTime();
}

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

module.exports = {
  MS_PER_MINUTE,
  MS_PER_HOUR,
  parseDecimal,
  calculateReturnPercent,
  calculateThresholdPrices,
  floorToBucket,
  evaluateEligibility,
  updateExtremes,
  applyMilestones,
  evaluateTpSlFromSnapshots,
  determineFirstExit,
  determineCompletion,
  isValidPrice
};
