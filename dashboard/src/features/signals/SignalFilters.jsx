import React from 'react';
import { PAGE_SIZE_OPTIONS } from '../../lib/constants';

const SORT_OPTIONS = [
  { value: 'sentAt:desc', label: 'Latest signal' },
  { value: 'sentAt:asc', label: 'Oldest signal' },
  { value: 'score:desc', label: 'Highest score' },
  { value: 'score:asc', label: 'Lowest score' }
];

export function SignalFilters({ filters, searchValue, onSearchChange, onChange, onReset, disabled }) {
  const sortValue = `${filters.sort}:${filters.order}`;
  return <section className="rounded-[2rem] bg-white p-4 shadow-card">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_0.8fr_auto] xl:items-end">
      <Field label="Search">
        <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder="Symbol, name, or address" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" />
      </Field>
      <Field label="Signal">
        <select value={filters.signal || 'ALL'} onChange={(event) => onChange({ signal: event.target.value === 'ALL' ? null : event.target.value, page: 1 })} disabled={disabled} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          <option value="ALL">All</option><option value="BUY">BUY</option><option value="WATCH">WATCH</option>
        </select>
      </Field>
      <Field label="Sort">
        <select value={sortValue} onChange={(event) => { const [sort, order] = event.target.value.split(':'); onChange({ sort, order, page: 1 }); }} disabled={disabled} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <Field label="Page size">
        <select value={filters.limit} onChange={(event) => onChange({ limit: Number(event.target.value), page: 1 })} disabled={disabled} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <button type="button" onClick={onReset} disabled={disabled} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Reset</button>
    </div>
  </section>;
}
function Field({ label, children }) { return <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>{children}</label>; }
