import React from 'react';
export function LoadingSkeleton({ rows = 3 }) {
  return <div className="space-y-4">{Array.from({ length: rows }, (_, index) => <div key={index} className="animate-pulse rounded-3xl bg-white p-5 shadow-card"><div className="h-4 w-1/3 rounded bg-slate-200" /><div className="mt-4 h-8 w-2/3 rounded bg-slate-200" /><div className="mt-4 h-24 rounded-2xl bg-slate-100" /></div>)}</div>;
}
