import React from 'react';
import { SignalBadge } from '../../components/SignalBadge';
import { formatUsd, formatWib, shortAddress } from '../../lib/format';

export function SignalsMobileList({ rows = [], onOpenDetail }) {
  return <div className="space-y-3 lg:hidden">{rows.map((signal) => <article key={signal.id} className="rounded-[2rem] bg-white p-4 shadow-card">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-extrabold text-slate-950">{signal.name || 'Unnamed token'}</div><div className="text-xs font-semibold text-slate-500">{signal.symbol || '—'} · {shortAddress(signal.tokenAddress)}</div></div><SignalBadge signal={signal.signal} /></div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Item label="Score" value={signal.score ?? '—'} /><Item label="Price at signal" value={formatUsd(signal.priceAtSignal)} /><Item label="Current price" value={formatUsd(signal.currentTokenPrice)} /><Item label="Signal time" value={formatWib(signal.sentAt, '—')} /></div>
    <button type="button" onClick={(event) => onOpenDetail(signal.tokenAddress, event.currentTarget)} className="mt-4 w-full rounded-2xl bg-navy px-4 py-3 text-sm font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`View details for ${signal.symbol || signal.name || signal.tokenAddress}`}>View details</button>
  </article>)}</div>;
}
function Item({ label, value, wide }) { return <div className={wide ? 'col-span-2' : ''}><div className="text-xs font-bold uppercase text-slate-400">{label}</div><div className="font-bold text-slate-900">{value}</div></div>; }
