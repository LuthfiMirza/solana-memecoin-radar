import React from 'react';
import { ExternalLink } from 'lucide-react';
import { SignalBadge } from '../../components/SignalBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { compactUsd, formatPercent, formatUsd, formatWib, shortAddress } from '../../lib/format';

export function MarketScannerTable({ rows = [], onOpenDetail }) {
  return <div className="hidden overflow-x-auto rounded-[2rem] bg-white shadow-card lg:block">
    <table className="min-w-[1180px] w-full text-left text-sm">
      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <Th>Token</Th><Th>Signal</Th><Th>Score</Th><Th>Risk</Th><Th>Price</Th><Th>Liquidity</Th><Th>Volume 24h</Th><Th>Market Cap</Th><Th>Holder Info</Th><Th>Last Scanned</Th><Th>Detail</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((token) => <tr key={token.tokenAddress} className="hover:bg-slate-50/80">
          <td className="px-5 py-4"><TokenCell token={token} /></td>
          <td className="px-5 py-4"><SignalBadge signal={token.signal} /></td>
          <td className="px-5 py-4 font-extrabold text-slate-900">{token.score ?? '—'}</td>
          <td className="px-5 py-4"><div className="space-y-1"><StatusBadge status={token.rugStatus}>{token.rugStatus || 'UNKNOWN'}</StatusBadge><div className="text-xs text-slate-400">Score {token.rugScore ?? '—'}</div></div></td>
          <td className="px-5 py-4 font-semibold">{formatUsd(token.priceUsd)}</td>
          <td className="px-5 py-4">{compactUsd(token.liquidityUsd)}</td>
          <td className="px-5 py-4">{compactUsd(token.volume24hUsd)}</td>
          <td className="px-5 py-4">{compactUsd(token.marketCapUsd)}</td>
          <td className="px-5 py-4">{token.topHolderPercent !== null && token.topHolderPercent !== undefined ? `${formatPercent(token.topHolderPercent, { signed: false })} top` : '—'}</td>
          <td className="px-5 py-4 text-slate-600">{formatWib(token.lastScannedAt, '—')}</td>
          <td className="px-5 py-4"><button type="button" onClick={(event) => onOpenDetail(token.tokenAddress, event.currentTarget)} className="inline-flex items-center gap-2 rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`View details for ${token.symbol || token.name || token.tokenAddress}`}>View <ExternalLink className="h-3 w-3" /></button></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function Th({ children }) { return <th className="px-5 py-4 font-extrabold">{children}</th>; }
function TokenCell({ token }) {
  const label = token.symbol || '?';
  return <div className="flex min-w-[220px] items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-100 text-sm font-black text-blue-700">{label.slice(0, 2).toUpperCase()}</div><div><div className="font-extrabold text-slate-950">{token.name || 'Unnamed token'}</div><div className="text-xs font-semibold text-slate-500">{token.symbol || '—'} · {shortAddress(token.tokenAddress)}</div></div></div>;
}
