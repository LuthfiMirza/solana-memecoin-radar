import React from 'react';
export function SignalBadge({ signal }) {
  const styles = { BUY: 'bg-emerald-100 text-emerald-700', WATCH: 'bg-amber-100 text-amber-700', AVOID: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${styles[signal] || styles.AVOID}`}>{signal || 'UNKNOWN'}</span>;
}
