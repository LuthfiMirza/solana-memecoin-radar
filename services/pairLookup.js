const axios = require('axios');

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapPair(pair) {
  const buys = num(pair.txns?.h24?.buys);
  const sells = num(pair.txns?.h24?.sells);
  return {
    tokenAddress: pair.baseToken?.address,
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    pairAddress: pair.pairAddress || null,
    dexId: pair.dexId || null,
    priceUsd: num(pair.priceUsd),
    liquidityUsd: num(pair.liquidity?.usd),
    volume24hUsd: num(pair.volume?.h24),
    marketCapUsd: num(pair.marketCap || pair.fdv),
    buys24h: buys,
    sells24h: sells,
    buySellRatio: sells > 0 ? buys / sells : (buys > 0 ? buys : 0),
    url: pair.url || null,
    raw: pair
  };
}

async function getTokenData(tokenAddress) {
  const { data } = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { timeout: 20000 });
  const pairs = (data.pairs || []).filter((pair) => pair.chainId === 'solana');
  if (pairs.length === 0) {
    if (process.env.NODE_ENV === 'debug') {
      console.log('DexScreener debug:', { tokenAddress, pairs: 0, selected: null });
    }
    return null;
  }

  pairs.sort((a, b) => num(b.liquidity?.usd) - num(a.liquidity?.usd));
  const selected = mapPair(pairs[0]);
  if (process.env.NODE_ENV === 'debug') {
    console.log('DexScreener debug:', {
      tokenAddress,
      pairs: pairs.length,
      symbol: selected.symbol,
      priceUsd: selected.priceUsd,
      liquidityUsd: selected.liquidityUsd,
      volume24hUsd: selected.volume24hUsd,
      marketCapUsd: selected.marketCapUsd,
      buySellRatio: selected.buySellRatio
    });
  }
  return selected;
}

module.exports = { getTokenData };
