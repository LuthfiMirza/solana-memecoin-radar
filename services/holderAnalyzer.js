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

  const url = `https://api.helius.xyz/v0/token-metadata?api-key=${process.env.HELIUS_API_KEY}`;
  try {
    const { data } = await axios.post(url, { mintAccounts: [tokenAddress] }, { timeout: 20000 });
    const metadata = Array.isArray(data) ? data[0] : data;
    const holders = metadata?.holders || metadata?.topHolders || [];
    if (holders.length === 0) {
      if (process.env.NODE_ENV === 'debug') {
        console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: 0, note: 'Data holder tidak ditemukan' });
      }
      return { topHolderPercent: null, holders: [], note: 'Data holder tidak ditemukan' };
    }

    const total = holders.reduce((sum, holder) => sum + toNumber(holder.percentage || holder.amount || holder.share || 0), 0);
    const top = toNumber(holders[0].percentage || holders[0].share || holders[0].amount || 0);
    const topHolderPercent = total > 0 ? top : null;
    if (process.env.NODE_ENV === 'debug') {
      console.log('Holder debug:', { tokenAddress, topHolderPercent, holders: holders.length, note: 'OK' });
    }
    return { topHolderPercent, holders, note: 'OK' };
  } catch (error) {
    if (process.env.NODE_ENV === 'debug') {
      console.log('Holder debug:', { tokenAddress, topHolderPercent: null, holders: 0, note: error.message });
    }
    return { topHolderPercent: null, holders: [], note: error.message };
  }
}

module.exports = { getTopHolderPercent };
