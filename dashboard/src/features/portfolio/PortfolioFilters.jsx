import React from 'react';
import { PAGE_SIZE_OPTIONS } from '../../lib/constants';

const SORT_OPTIONS = {
  ACTIVE: [
    { value: 'openedAt:desc', label: 'Newest opened' },
    { value: 'openedAt:asc', label: 'Oldest opened' },
    { value: 'pnlPercent:desc', label: 'Highest P&L' },
    { value: 'pnlPercent:asc', label: 'Lowest P&L' }
  ],
  CLOSED: [
    { value: 'closedAt:desc', label: 'Recently closed' },
    { value: 'closedAt:asc', label: 'Oldest closed' },
    { value: 'pnlPercent:desc', label: 'Highest P&L' },
    { value: 'pnlPercent:asc', label: 'Lowest P&L' }
  ]
};

export function PortfolioFilters({ filters, onChange, disabled }) {
  const sortValue = `${filters.sort}:${filters.order}`;
  return <section className="rounded-[2rem] bg-white p-4 shadow-card">
    <div className="mb-4 flex gap-2" role="tablist" aria-label="Portfolio status">
      {['ACTIVE', 'CLOSED'].map((status) => <button key={status} type="button" role="tab" aria-selected={filters.status === status} onClick={() => onChange({ status, sort: status === 'ACTIVE' ? 'openedAt' : 'closedAt', order: 'desc', page: 1 })} className={`rounded-2xl px-4 py-2 text-sm font-extrabold focus:outline-none focus:ring-2 focus:ring-blue-400 ${filters.status === status ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{status === 'ACTIVE' ? 'Active Positions' : 'Closed Positions'}</button>)}
    </div>
    <div className="grid gap-3 md:grid-cols-[1fr_0.7fr] xl:max-w-2xl">
      <Field label="Sort">
        <select value={sortValue} onChange={(event) => { const [sort, order] = event.target.value.split(':'); onChange({ sort, order, page: 1 }); }} disabled={disabled} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          {SORT_OPTIONS[filters.status].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <Field label="Page size">
        <select value={filters.limit} onChange={(event) => onChange({ limit: Number(event.target.value), page: 1 })} disabled={disabled} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
    </div>
  </section>;
}
function Field({ label, children }) { return <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>{children}</label>; }
