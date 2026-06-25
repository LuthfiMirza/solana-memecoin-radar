const axios = require('axios');

function normalizeRisk(data) {
  const risks = data.risks || [];
  const highRisk = risks.some((risk) => ['danger', 'critical', 'high'].includes(String(risk.level || risk.severity || '').toLowerCase()));
  const score = Number(data.score ?? data.riskScore ?? 0);
  const status = data.tokenMeta?.mutable === false && !highRisk ? 'SAFE' : (highRisk || score > 5000 ? 'RISK' : 'SAFE');
  return { status, score, raw: data };
}

async function checkToken(tokenAddress) {
  try {
    const { data } = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`, { timeout: 20000 });
    const result = normalizeRisk(data || {});
    if (process.env.NODE_ENV === 'debug') {
      console.log('RugCheck debug:', { tokenAddress, status: result.status, score: result.score, risks: data?.risks?.length || 0 });
    }
    return result;
  } catch (error) {
    if (process.env.NODE_ENV === 'debug') {
      console.log('RugCheck debug:', { tokenAddress, status: 'UNKNOWN', score: null, error: error.message });
    }
    return { status: 'UNKNOWN', score: null, raw: { error: error.message } };
  }
}

module.exports = { checkToken };
