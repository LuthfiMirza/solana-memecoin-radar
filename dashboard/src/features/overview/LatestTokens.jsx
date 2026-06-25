import React from 'react';
import { EmptyState } from '../../components/EmptyState';
import { SignalBadge } from '../../components/SignalBadge';
import { formatUsd, formatWib, shortAddress } from '../../lib/format';
export function LatestTokens({ rows = [] }) {
  return <section className="rounded-[2rem] bg-white p-5 shadow-card"><h2 className="mb-4 text-lg font-extrabold">Latest Scanned Tokens</h2>{rows.length === 0 ? <EmptyState title="No scanned tokens" message="Tokens will appear after scanner activity." /> : <div className="space-y-3">{rows.slice(0, 6).map((row) => <div key={row.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-100 text-sm font-extrabold text-blue-700">{row.symbol?.[0] || '?'}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-900">{row.symbol || 'UNKNOWN'} <span className="font-normal text-slate-400">{shortAddress(row.tokenAddress)}</span></div><div className="truncate text-xs text-slate-500">{formatUsd(row.priceUsd)} • Liq {formatUsd(row.liquidityUsd)} • {formatWib(row.lastScannedAt)}</div></div><SignalBadge signal={row.signal} /></div>)}</div>}</section>;
}
