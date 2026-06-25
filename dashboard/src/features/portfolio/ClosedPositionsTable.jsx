import React from 'react';
import { ExternalLink } from 'lucide-react';
import { formatPercent, formatUsd, formatWib, parseDecimal, shortAddress } from '../../lib/format';

export function ClosedPositionsTable({ rows = [], onOpenDetail }) {
  return <div className="hidden overflow-x-auto rounded-[2rem] bg-white shadow-card lg:block"><table className="min-w-[1050px] w-full text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><Th>Token</Th><Th>Entry Price</Th><Th>Close Price</Th><Th>Final P&amp;L %</Th><Th>ATH Price</Th><Th>Close Reason</Th><Th>Opened At</Th><Th>Closed At</Th><Th>View Details</Th></tr></thead>
    <tbody className="divide-y divide-slate-100">{rows.map((position) => <tr key={position.id} className="hover:bg-slate-50/80"><td className="px-5 py-4"><div className="font-extrabold text-slate-950">{position.symbol || '—'}</div><div className="text-xs font-semibold text-slate-500">{shortAddress(position.tokenAddress)}</div></td><td className="px-5 py-4">{formatUsd(position.entryPrice)}</td><td className="px-5 py-4">{formatUsd(position.closePrice)}</td><td className="px-5 py-4"><Pnl value={position.pnlPercent} /></td><td className="px-5 py-4">{formatUsd(position.athPrice)}</td><td className="px-5 py-4">{position.closeReason || '—'}</td><td className="px-5 py-4 text-slate-600">{formatWib(position.openedAt, '—')}</td><td className="px-5 py-4 text-slate-600">{formatWib(position.closedAt, '—')}</td><td className="px-5 py-4"><button type="button" onClick={(event) => onOpenDetail(position.tokenAddress, event.currentTarget)} className="inline-flex items-center gap-2 rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`View details for ${position.symbol || position.tokenAddress}`}>View <ExternalLink className="h-3 w-3" /></button></td></tr>)}</tbody>
  </table></div>;
}
function Th({ children }) { return <th scope="col" className="px-5 py-4 font-extrabold">{children}</th>; }
function Pnl({ value }) { const number = parseDecimal(value); const color = number === null ? 'text-slate-500' : number > 0 ? 'text-emerald-700' : number < 0 ? 'text-red-700' : 'text-slate-700'; return <span className={`font-extrabold ${color}`}>{formatPercent(value)}</span>; }
