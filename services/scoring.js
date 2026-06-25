function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function liquidityPoints(liquidityUsd) {
  let points = 0;
  if (liquidityUsd >= 10000) points += 5;
  if (liquidityUsd >= 50000) points += 5;
  if (liquidityUsd >= 100000) points += 5;
  return points;
}

function volumePoints(volumeUsd) {
  let points = 0;
  if (volumeUsd >= 5000) points += 5;
  if (volumeUsd >= 25000) points += 5;
  if (volumeUsd >= 100000) points += 5;
  return points;
}

function marketCapPoints(marketCapUsd) {
  if (marketCapUsd >= 25000 && marketCapUsd <= 250000) return 15;
  if (marketCapUsd <= 1000000 && marketCapUsd > 0) return 10;
  return 0;
}

function holderPoints(topHolderPercent) {
  if (topHolderPercent === null || topHolderPercent === undefined) return 0;
  if (topHolderPercent <= 5) return 25;
  if (topHolderPercent <= 10) return 20;
  if (topHolderPercent <= 20) return 10;
  if (topHolderPercent >= 40) return -10;
  return 0;
}

function buySellPoints(ratio) {
  if (ratio >= 3.0) return 20;
  if (ratio >= 2.0) return 15;
  if (ratio >= 1.2) return 10;
  return 0;
}

function smartWalletPoints(count) {
  if (count >= 5) return 20;
  if (count >= 3) return 15;
  if (count >= 1) return 10;
  return 0;
}

function whaleEntryPoints(count) {
  if (count >= 3) return 15;
  if (count >= 2) return 10;
  if (count >= 1) return 5;
  return 0;
}

function rugcheckPoints(status) {
  if (status === 'SAFE') return 10;
  if (status === 'RISK') return -50;
  return 0;
}

function getSignal(score) {
  if (score >= 70) return 'BUY';
  if (score >= 60) return 'WATCH';
  return 'AVOID';
}

function scoreToken(input) {
  const liquidityUsd = number(input.liquidityUsd);
  const volumeUsd = number(input.volume24hUsd ?? input.volumeUsd);
  const marketCapUsd = number(input.marketCapUsd);
  const topHolderPercent = input.topHolderPercent === null || input.topHolderPercent === undefined ? null : number(input.topHolderPercent);
  const buySellRatio = number(input.buySellRatio);
  const smartWalletCount = number(input.smartWalletCount);
  const whaleEntryCount = number(input.whaleEntryCount);
  const rugStatus = input.rugStatus || 'UNKNOWN';

  const liquidityScore = liquidityPoints(liquidityUsd);
  const volumeScore = volumePoints(volumeUsd);
  const mcapScore = marketCapPoints(marketCapUsd);
  const holderScore = holderPoints(topHolderPercent);
  const ratioScore = buySellPoints(buySellRatio);
  const smartScore = smartWalletPoints(smartWalletCount);
  const whaleScore = whaleEntryPoints(whaleEntryCount);
  const rugScore = rugcheckPoints(rugStatus);

  const breakdown = {
    liquidity: liquidityScore,
    volume: volumeScore,
    marketCap: mcapScore,
    topHolder: holderScore,
    buySellRatio: ratioScore,
    smartWallet: smartScore,
    whaleEntry: whaleScore,
    rugcheck: rugScore
  };

  const rawScore = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const signal = getSignal(score);
  if (process.env.NODE_ENV === 'debug') {
    console.log('Scoring breakdown:', {
      liquidity: liquidityScore,
      volume: volumeScore,
      marketCap: mcapScore,
      topHolder: holderScore,
      buySellRatio: ratioScore,
      smartWallet: smartScore,
      whaleEntry: whaleScore,
      rugcheck: rugScore,
      rawTotal: rawScore,
      total: score,
      signal
    });
  }
  return { score, signal, breakdown };
}

module.exports = { scoreToken, getSignal };
