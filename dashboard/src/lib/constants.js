export const POLL_INTERVAL_MS = 15000;
export const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: 'Market Scanner', path: '/scanner' },
  { label: 'Signals', path: '/signals' },
  { label: 'Portfolio', path: '/portfolio' }
];

export const SIGNAL_OPTIONS = ['BUY', 'WATCH', 'AVOID'];
export const RUG_STATUS_OPTIONS = ['SAFE', 'RISK', 'UNKNOWN'];
export const MIN_SCORE_OPTIONS = [20, 40, 60, 70];
export const PAGE_SIZE_OPTIONS = [10, 20, 50];
export const SORT_OPTIONS = [
  { value: 'lastScannedAt', label: 'Latest scanned' },
  { value: 'score', label: 'Highest score' },
  { value: 'liquidity', label: 'Highest liquidity' },
  { value: 'volume', label: 'Highest volume' },
  { value: 'marketCap', label: 'Highest market cap' }
];
