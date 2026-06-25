import React from 'react';
import { EmptyState } from '../../components/EmptyState';
import { SignalBadge } from '../../components/SignalBadge';
import { formatUsd, formatWib, shortAddress } from '../../lib/format';
export function LatestSignals({ rows = [] }) {
  return <section className="rounded-[2rem] bg-white p-5 shadow-card"><h2 className="mb-4 text-lg font-extrabold">Latest BUY/WATCH Signals</h2>{rows.length === 0 ? <EmptyState title="No latest signals" message="BUY/WATCH alerts will appear here after Telegram signals are sent." /> : <div className="space-y-3">{rows.map((row) => <div key={row.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-extrabold text-slate-900">${row.symbol || shortAddress(row.tokenAddress)}</div><div className="text-xs text-slate-500">{shortAddress(row.tokenAddress)}</div></div><SignalBadge signal={row.signal} /></div><div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><span>Score {row.score}/100</span><span>Price {formatUsd(row.priceAtSignal)}</span><span>{formatWib(row.sentAt)}</span></div></div>)}</div>}</section>;
}
