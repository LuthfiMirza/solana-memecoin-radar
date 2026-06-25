export function formatWib(value, fallback = 'Unknown') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB`;
}

export function formatUsd(value, options = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number === 0) return '$0';
  if (Math.abs(number) >= 1000 && options.compact) return compactUsd(number);
  if (Math.abs(number) >= 1000) return `$${Math.round(number).toLocaleString('en-US')}`;
  if (Math.abs(number) < 0.00000001) return `$${number.toExponential(2)}`;
  if (Math.abs(number) < 0.01) return `$${trimZeros(number.toFixed(12))}`;
  return `$${number.toLocaleString('en-US', { maximumFractionDigits: options.maxFractionDigits || 6 })}`;
}

export function compactUsd(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(number);
}

export function formatPercent(value, { signed = true } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${signed && number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

export function parseDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatRatio(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(2)}×`;
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-US');
}

export function shortAddress(address) {
  if (!address) return '—';
  return address.length <= 12 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function trimZeros(value) {
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}
