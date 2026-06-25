const axios = require('axios');

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VE5keVcGQkBzY8S2M9sG7sHPeuZ';
const BLACKLIST = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'So11111111111111111111111111111111111111112',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1'
]);

function isBlacklisted(tokenAddress) {
  return BLACKLIST.has(tokenAddress);
}

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

  const discovered = unique(tokens.map((token) => token.tokenAddress));
  const filtered = discovered.filter((tokenAddress) => !isBlacklisted(tokenAddress));

  if (process.env.NODE_ENV === 'debug') {
    console.log('Discovery debug:', {
      signatures: signatures.length,
      discovered: discovered.length,
      blacklisted: discovered.length - filtered.length,
      candidates: filtered.length
    });
  }

  return filtered.map((tokenAddress) => ({ tokenAddress }));
}

module.exports = { discoverNewTokens, isBlacklisted, BLACKLIST };
