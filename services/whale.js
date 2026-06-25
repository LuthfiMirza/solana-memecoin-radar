const axios = require('axios');

const WHALE_THRESHOLD_USD = 10000;
const CACHE_TTL = 5 * 60 * 1000;
const MAX_TRANSACTIONS = 10;
const whaleCache = new Map();

function rpcUrl() {
  if (!process.env.HELIUS_API_KEY) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function rpc(method, params) {
  const url = rpcUrl();
  if (!url) throw new Error('HELIUS_API_KEY belum tersedia');
  const { data } = await axios.post(url, { jsonrpc: '2.0', id: method, method, params }, { timeout: 20000 });
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function parseWhaleOwners(transaction, tokenAddress, tokenPriceUsd) {
  const preBalances = transaction?.meta?.preTokenBalances || [];
  const postBalances = transaction?.meta?.postTokenBalances || [];
  const balances = new Map();

  for (const balance of preBalances) {
    if (balance.mint !== tokenAddress) continue;
    const owner = balance.owner || `account-${balance.accountIndex}`;
    const current = balances.get(owner) || { pre: 0, post: 0 };
    current.pre += number(balance.uiTokenAmount?.uiAmountString ?? balance.uiTokenAmount?.uiAmount);
    balances.set(owner, current);
  }

  for (const balance of postBalances) {
    if (balance.mint !== tokenAddress) continue;
    const owner = balance.owner || `account-${balance.accountIndex}`;
    const current = balances.get(owner) || { pre: 0, post: 0 };
    current.post += number(balance.uiTokenAmount?.uiAmountString ?? balance.uiTokenAmount?.uiAmount);
    balances.set(owner, current);
  }

  const whaleOwners = [];
  for (const [owner, balance] of balances.entries()) {
    const delta = balance.post - balance.pre;
    if (delta <= 0) continue;
    if (delta * tokenPriceUsd >= WHALE_THRESHOLD_USD) whaleOwners.push(owner);
  }

  return whaleOwners;
}

async function detectWhaleEntries(tokenAddress, tokenPriceUsd) {
  const price = number(tokenPriceUsd);
  if (!tokenAddress || price <= 0) return { whaleCount: 0, whaleAddresses: [], checkedTransactions: 0, note: 'Harga token tidak valid' };

  const cached = whaleCache.get(tokenAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;

  try {
    const signatures = await rpc('getSignaturesForAddress', [tokenAddress, { limit: 50 }]);
    const selected = (signatures || []).slice(0, MAX_TRANSACTIONS);
    const transactions = await Promise.all(selected.map((item) => rpc('getTransaction', [
      item.signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
    ]).catch(() => null)));

    const whaleAddresses = new Set();
    for (const transaction of transactions.filter(Boolean)) {
      for (const owner of parseWhaleOwners(transaction, tokenAddress, price)) whaleAddresses.add(owner);
    }

    const result = {
      whaleCount: whaleAddresses.size,
      whaleAddresses: [...whaleAddresses],
      checkedTransactions: selected.length,
      note: 'OK'
    };
    whaleCache.set(tokenAddress, { timestamp: Date.now(), result });

    if (process.env.NODE_ENV === 'debug') {
      console.log('Whale debug:', { tokenAddress, whaleCount: result.whaleCount, checkedTransactions: result.checkedTransactions });
    }
    return result;
  } catch (error) {
    const result = { whaleCount: 0, whaleAddresses: [], checkedTransactions: 0, note: error.message };
    whaleCache.set(tokenAddress, { timestamp: Date.now(), result });
    if (process.env.NODE_ENV === 'debug') {
      console.log('Whale debug:', { tokenAddress, whaleCount: 0, error: error.message });
    }
    return result;
  }
}

module.exports = { detectWhaleEntries };
