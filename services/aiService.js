const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

function buildPrompt(context) {
  return [
    'Analisis token Solana berikut secara singkat dan berikan kesimpulan praktis dalam Bahasa Indonesia.',
    'Fokus pada risiko rug pull, kualitas likuiditas, tekanan beli/jual, dan alasan utama skor.',
    'Jawab dalam 4-6 bullet ringkas tanpa markdown tabel.',
    '',
    `Token: ${context.symbol || 'UNKNOWN'} (${context.tokenAddress})`,
    `Harga: ${context.priceUsd ?? 'n/a'}`,
    `Likuiditas: ${context.liquidityUsd ?? 'n/a'}`,
    `Volume 24h: ${context.volume24hUsd ?? 'n/a'}`,
    `Market Cap: ${context.marketCapUsd ?? 'n/a'}`,
    `Top Holder %: ${context.topHolderPercent ?? 'n/a'}`,
    `Buy/Sell Ratio: ${context.buySellRatio ?? 'n/a'}`,
    `Smart Wallet: ${context.smartWalletCount ?? 0}`,
    `Whale Entry: ${context.whaleEntryCount ?? 0}`,
    `RugCheck: ${context.rugStatus || 'UNKNOWN'}`,
    `Skor: ${context.score}`,
    `Sinyal: ${context.signal}`
  ].join('\n');
}

async function groqSummary(context) {
  if (!process.env.GROQ_API_KEY) return null;
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'Kamu adalah analis memecoin Solana yang ringkas, tajam, dan objektif.' },
      { role: 'user', content: buildPrompt(context) }
    ],
    temperature: 0.3,
    max_tokens: 250
  });
  return response.choices?.[0]?.message?.content?.trim() || null;
}

async function geminiSummary(context) {
  if (!process.env.GEMINI_API_KEY) return null;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
  const result = await model.generateContent(buildPrompt(context));
  return result.response.text().trim();
}

async function generateSummary(context) {
  try {
    const groq = await groqSummary(context);
    if (groq) return { provider: 'groq', summary: groq };
  } catch (error) {
    console.warn(`Groq gagal: ${error.message}`);
  }

  try {
    const gemini = await geminiSummary(context);
    if (gemini) return { provider: 'gemini', summary: gemini };
  } catch (error) {
    console.warn(`Gemini gagal: ${error.message}`);
  }

  return {
    provider: 'none',
    summary: `Token ${context.symbol || 'UNKNOWN'} mendapat skor ${context.score} dengan sinyal ${context.signal}. Likuiditas ${context.liquidityUsd ?? 'n/a'}, volume ${context.volume24hUsd ?? 'n/a'}, market cap ${context.marketCapUsd ?? 'n/a'}.`
  };
}

module.exports = { generateSummary };
