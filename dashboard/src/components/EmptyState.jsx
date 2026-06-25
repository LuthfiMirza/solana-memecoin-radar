import React from 'react';
export function EmptyState({ title, message }) { return <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><div className="text-sm font-bold text-slate-600">{title}</div><p className="mt-1 text-sm text-slate-400">{message}</p></div>; }
