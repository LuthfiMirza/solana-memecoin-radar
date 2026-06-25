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
    return normalizeRisk(data || {});
  } catch (error) {
    return { status: 'UNKNOWN', score: null, raw: { error: error.message } };
  }
}

module.exports = { checkToken };
