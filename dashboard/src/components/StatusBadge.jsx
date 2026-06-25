import React from 'react';
export function StatusBadge({ status, children }) {
  const styles = { online: 'bg-emerald-100 text-emerald-700 ring-emerald-200', ok: 'bg-emerald-100 text-emerald-700 ring-emerald-200', recent: 'bg-emerald-100 text-emerald-700 ring-emerald-200', stale: 'bg-amber-100 text-amber-700 ring-amber-200', unknown: 'bg-slate-100 text-slate-600 ring-slate-200', offline: 'bg-red-100 text-red-700 ring-red-200', degraded: 'bg-amber-100 text-amber-700 ring-amber-200' };
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ring-1 ${styles[status] || styles.unknown}`}><span className="h-2 w-2 rounded-full bg-current" />{children || status}</span>;
}
