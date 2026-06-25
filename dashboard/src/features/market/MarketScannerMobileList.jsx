import React from 'react';
import { SignalBadge } from '../../components/SignalBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { compactUsd, formatUsd, formatWib, shortAddress } from '../../lib/format';

export function MarketScannerMobileList({ rows = [], onOpenDetail }) {
  return <div className="space-y-3 lg:hidden">{rows.map((token) => <article key={token.tokenAddress} className="rounded-[2rem] bg-white p-4 shadow-card">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="font-extrabold text-slate-950">{token.name || 'Unnamed token'}</div><div className="text-xs font-semibold text-slate-500">{token.symbol || '—'} · {shortAddress(token.tokenAddress)}</div></div>
      <SignalBadge signal={token.signal} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <Item label="Score" value={token.score ?? '—'} />
      <div><div className="text-xs font-bold uppercase text-slate-400">Risk</div><StatusBadge status={token.rugStatus}>{token.rugStatus || 'UNKNOWN'}</StatusBadge></div>
      <Item label="Price" value={formatUsd(token.priceUsd)} />
      <Item label="Liquidity" value={compactUsd(token.liquidityUsd)} />
      <Item label="Last scanned" value={formatWib(token.lastScannedAt, '—')} wide />
    </div>
    <button type="button" onClick={(event) => onOpenDetail(token.tokenAddress, event.currentTarget)} className="mt-4 w-full rounded-2xl bg-navy px-4 py-3 text-sm font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`View details for ${token.symbol || token.name || token.tokenAddress}`}>View details</button>
  </article>)}</div>;
}
function Item({ label, value, wide }) { return <div className={wide ? 'col-span-2' : ''}><div className="text-xs font-bold uppercase text-slate-400">{label}</div><div className="font-bold text-slate-900">{value}</div></div>; }
