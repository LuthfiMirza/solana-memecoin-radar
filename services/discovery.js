const axios = require('axios');

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VE5keVcGQkBzY8S2M9sG7sHPeuZ';

function heliusUrl() {
  if (!process.env.HELIUS_API_KEY) return null;
  return `https://api.helius.xyz/v0/transactions/?api-key=${process.env.HELIUS_API_KEY}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractMintAddresses(transaction) {
  const mints = [];
  const tokenTransfers = transaction.tokenTransfers || [];
  for (const transfer of tokenTransfers) {
    if (transfer.mint) mints.push(transfer.mint);
  }

  const instructions = transaction.instructions || [];
  for (const instruction of instructions) {
    const programId = instruction.programId || instruction.programIdIndex;
    const parsedType = instruction.parsed?.type || instruction.type;
    const mint = instruction.parsed?.info?.mint || instruction.accounts?.[0];
    if ((programId === TOKEN_PROGRAM_ID || programId === TOKEN_2022_PROGRAM_ID) && /initializeMint/i.test(parsedType || '') && mint) {
      mints.push(mint);
    }
  }

  return unique(mints);
}

async function fetchRecentSignatures(address, limit) {
  const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  const { data } = await axios.post(url, {
    jsonrpc: '2.0',
    id: 'recent-signatures',
    method: 'getSignaturesForAddress',
    params: [address, { limit }]
  }, { timeout: 20000 });

  if (data.error) throw new Error(data.error.message);
  return (data.result || []).map((item) => item.signature);
}

async function discoverNewTokens(options = {}) {
  if (!process.env.HELIUS_API_KEY) {
    console.warn('HELIUS_API_KEY belum diisi; discovery dilewati.');
    return [];
  }

  const watchAddress = process.env.HELIUS_DISCOVERY_ADDRESS || TOKEN_PROGRAM_ID;
  const signatureLimit = Number(process.env.HELIUS_SIGNATURE_LIMIT || options.limit || 20);
  const signatures = await fetchRecentSignatures(watchAddress, signatureLimit);
  if (signatures.length === 0) return [];

  const { data } = await axios.post(heliusUrl(), { transactions: signatures }, { timeout: 30000 });
  const tokens = [];

  for (const transaction of data || []) {
    const mints = extractMintAddresses(transaction);
    for (const mint of mints) {
      tokens.push({ tokenAddress: mint, discoveredAt: new Date(), sourceSignature: transaction.signature });
    }
  }

  return unique(tokens.map((token) => token.tokenAddress)).map((tokenAddress) => ({ tokenAddress }));
}

module.exports = { discoverNewTokens };
