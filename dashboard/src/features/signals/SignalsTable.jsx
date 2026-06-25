import React from 'react';
import { ExternalLink } from 'lucide-react';
import { SignalBadge } from '../../components/SignalBadge';
import { formatUsd, formatWib, shortAddress } from '../../lib/format';

export function SignalsTable({ rows = [], onOpenDetail }) {
  return <div className="hidden overflow-x-auto rounded-[2rem] bg-white shadow-card lg:block">
    <table className="min-w-[900px] w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><Th>Token</Th><Th>Signal</Th><Th>Score</Th><Th>Price at Signal</Th><Th>Current Price</Th><Th>Signal Time</Th><Th>View Details</Th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((signal) => <tr key={signal.id} className="hover:bg-slate-50/80">
        <td className="px-5 py-4"><TokenCell token={signal} /></td>
        <td className="px-5 py-4"><SignalBadge signal={signal.signal} /></td>
        <td className="px-5 py-4 font-extrabold text-slate-900">{signal.score ?? '—'}</td>
        <td className="px-5 py-4 font-semibold text-slate-700">{formatUsd(signal.priceAtSignal)}</td>
        <td className="px-5 py-4 font-semibold text-slate-700">{formatUsd(signal.currentTokenPrice)}</td>
        <td className="px-5 py-4 text-slate-600">{formatWib(signal.sentAt, '—')}</td>
        <td className="px-5 py-4"><button type="button" onClick={(event) => onOpenDetail(signal.tokenAddress, event.currentTarget)} className="inline-flex items-center gap-2 rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`View details for ${signal.symbol || signal.name || signal.tokenAddress}`}>View <ExternalLink className="h-3 w-3" /></button></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
function Th({ children }) { return <th scope="col" className="px-5 py-4 font-extrabold">{children}</th>; }
function TokenCell({ token }) { return <div className="min-w-[220px]"><div className="font-extrabold text-slate-950">{token.name || 'Unnamed token'}</div><div className="text-xs font-semibold text-slate-500">{token.symbol || '—'} · {shortAddress(token.tokenAddress)}</div></div>; }
