import React from 'react';
export function MetricCard({ label, value, helper, tone = 'blue' }) {
  const tones = { blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-50 text-slate-700' };
  return <div className="rounded-3xl bg-white p-5 shadow-card"><div className="text-sm font-semibold text-slate-500">{label}</div><div className={`mt-3 inline-flex rounded-2xl px-3 py-1 text-3xl font-extrabold ${tones[tone]}`}>{value}</div>{helper && <div className="mt-3 text-xs text-slate-400">{helper}</div>}</div>;
}
