const axios = require('axios');

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getTopHolderPercent(tokenAddress) {
  if (!process.env.HELIUS_API_KEY) {
    if (process.env.NODE_ENV === 'debug') {
      console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: 0, note: 'HELIUS_API_KEY belum tersedia' });
    }
    return { topHolderPercent: null, holders: [], note: 'HELIUS_API_KEY belum tersedia' };
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  try {
    const [largestResponse, supplyResponse] = await Promise.all([
      axios.post(url, {
        jsonrpc: '2.0',
        id: 'largest-accounts',
        method: 'getTokenLargestAccounts',
        params: [tokenAddress]
      }, { timeout: 20000 }),
      axios.post(url, {
        jsonrpc: '2.0',
        id: 'token-supply',
        method: 'getTokenSupply',
        params: [tokenAddress]
      }, { timeout: 20000 })
    ]);

    const largestData = largestResponse.data;
    const supplyData = supplyResponse.data;
    if (largestData.error || supplyData.error) {
      const note = largestData.error?.message || supplyData.error?.message || 'Helius RPC error';
      console.warn(`Holder analyzer warning for ${tokenAddress}: ${note}`);
      if (process.env.NODE_ENV === 'debug') {
        console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: 0, totalSupply: null, note });
      }
      return { topHolderPercent: null, holders: [], note };
    }

    const holders = largestData.result?.value || [];
    const totalSupply = toNumber(supplyData.result?.value?.uiAmountString ?? supplyData.result?.value?.uiAmount);
    if (holders.length === 0) {
      if (process.env.NODE_ENV === 'debug') {
        console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: 0, totalSupply, note: 'Data holder tidak ditemukan' });
      }
      return { topHolderPercent: null, holders: [], note: 'Data holder tidak ditemukan' };
    }
    if (!totalSupply || totalSupply <= 0) {
      const note = 'Total supply tidak valid';
      console.warn(`Holder analyzer warning for ${tokenAddress}: ${note}`);
      if (process.env.NODE_ENV === 'debug') {
        console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: holders.length, totalSupply, note });
      }
      return { topHolderPercent: null, holders, note };
    }

    const largestHolderAmount = toNumber(holders[0].uiAmountString ?? holders[0].uiAmount);
    const topHolderPercent = (largestHolderAmount / totalSupply) * 100;
    if (process.env.NODE_ENV === 'debug') {
      console.log('Holder debug:', { tokenAddress, topHolderPercent, holders: holders.length, largestHolderAmount, totalSupply, note: 'OK' });
    }
    return { topHolderPercent, holders, note: 'OK' };
  } catch (error) {
    console.warn(`Holder analyzer warning for ${tokenAddress}: ${error.message}`);
    if (process.env.NODE_ENV === 'debug') {
      console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: 0, note: error.message });
    }
    return { topHolderPercent: null, holders: [], note: error.message };
  }
}

module.exports = { getTopHolderPercent };
