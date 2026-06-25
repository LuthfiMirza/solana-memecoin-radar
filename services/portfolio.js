const { query, transaction } = require('../config/db');
const { getTokenData } = require('./pairLookup');

const MAX_ACTIVE_HOLDINGS = 5;
const STOP_LOSS_PERCENT = -20;
const ATH_DROP_PERCENT = -30;

function percentChange(current, entry) {
  if (!entry || entry <= 0) return 0;
  return ((current - entry) / entry) * 100;
}

async function getActiveHoldings() {
  return query('SELECT * FROM portfolio WHERE \`status\` = ? ORDER BY opened_at ASC', ['ACTIVE']);
}

async function buyToken(tokenAddress, entryPrice, takeProfitPercent) {
  const entry = Number(entryPrice);
  const tpPercent = Number(takeProfitPercent);
  if (!tokenAddress || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(tpPercent) || tpPercent <= 0) {
    throw new Error('Format salah. Gunakan: /buy <token_address> <entry_price> <tp_percent>');
  }

  return transaction(async (connection) => {
    const [activeRows] = await connection.execute('SELECT COUNT(*) AS total FROM portfolio WHERE \`status\` = ?', ['ACTIVE']);
    if (activeRows[0].total >= MAX_ACTIVE_HOLDINGS) {
      throw new Error('Portfolio penuh. Maksimal 5 token aktif bersamaan.');
    }

    const [existing] = await connection.execute('SELECT id FROM portfolio WHERE token_address = ? AND \`status\` = ?', [tokenAddress, 'ACTIVE']);
    if (existing.length > 0) {
      throw new Error('Token ini sudah aktif di portfolio.');
    }

    const pair = await getTokenData(tokenAddress).catch(() => null);
    const symbol = pair?.symbol || null;
    const takeProfitPrice = entry * (1 + tpPercent / 100);
    const stopLossPrice = entry * 0.8;

    await connection.execute(
      `INSERT INTO portfolio (token_address, symbol, entry_price, take_profit_percent, take_profit_price, stop_loss_price, ath_price, current_price, pnl_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tokenAddress, symbol, entry, tpPercent, takeProfitPrice, stopLossPrice, entry, entry, 0]
    );

    return { tokenAddress, symbol, entryPrice: entry, takeProfitPercent: tpPercent, takeProfitPrice, stopLossPrice };
  });
}

async function sellToken(tokenAddress, reason = 'MANUAL') {
  const pair = await getTokenData(tokenAddress).catch(() => null);
  const closePrice = pair?.priceUsd || null;
  const rows = await query(
    `UPDATE portfolio
     SET \`status\` = 'CLOSED', close_price = ?, close_reason = ?, closed_at = NOW()
     WHERE token_address = ? AND \`status\` = 'ACTIVE'`,
    [closePrice, reason, tokenAddress]
  );
  if (rows.affectedRows === 0) throw new Error('Token tidak ditemukan di portfolio aktif.');
  return { tokenAddress, closePrice, reason };
}

async function portfolioSummary() {
  const holdings = await getActiveHoldings();
  if (holdings.length === 0) return [];

  const updated = [];
  for (const holding of holdings) {
    const pair = await getTokenData(holding.token_address).catch(() => null);
    const currentPrice = pair?.priceUsd || Number(holding.current_price || holding.entry_price);
    const pnlPercent = percentChange(currentPrice, Number(holding.entry_price));
    updated.push({ ...holding, current_price: currentPrice, pnl_percent: pnlPercent, symbol: pair?.symbol || holding.symbol });
  }
  return updated;
}

async function monitorHoldings() {
  const holdings = await getActiveHoldings();
  const alerts = [];

  for (const holding of holdings) {
    const pair = await getTokenData(holding.token_address).catch(() => null);
    if (!pair || !pair.priceUsd) continue;

    const currentPrice = Number(pair.priceUsd);
    const entryPrice = Number(holding.entry_price);
    const previousAth = Number(holding.ath_price || entryPrice);
    const athPrice = Math.max(previousAth, currentPrice);
    const pnlPercent = percentChange(currentPrice, entryPrice);
    const athDropPercent = percentChange(currentPrice, athPrice);

    let trigger = null;
    if (currentPrice >= Number(holding.take_profit_price)) trigger = 'TAKE_PROFIT';
    if (pnlPercent <= STOP_LOSS_PERCENT) trigger = 'STOP_LOSS';
    if (athDropPercent <= ATH_DROP_PERCENT) trigger = 'ATH_DROP';

    await query(
      'UPDATE portfolio SET current_price = ?, ath_price = ?, pnl_percent = ? WHERE id = ?',
      [currentPrice, athPrice, pnlPercent, holding.id]
    );

    if (trigger) {
      await query(
        `UPDATE portfolio SET \`status\` = 'CLOSED', close_price = ?, close_reason = ?, closed_at = NOW() WHERE id = ? AND \`status\` = 'ACTIVE'`,
        [currentPrice, trigger, holding.id]
      );
      alerts.push({ ...holding, symbol: pair.symbol || holding.symbol, currentPrice, pnlPercent, athPrice, athDropPercent, trigger });
    }
  }

  return alerts;
}

module.exports = { buyToken, sellToken, portfolioSummary, monitorHoldings, MAX_ACTIVE_HOLDINGS };
