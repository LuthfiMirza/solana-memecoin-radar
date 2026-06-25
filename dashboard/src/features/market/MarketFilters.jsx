import React from 'react';
import { MIN_SCORE_OPTIONS, PAGE_SIZE_OPTIONS, RUG_STATUS_OPTIONS, SIGNAL_OPTIONS, SORT_OPTIONS } from '../../lib/constants';

export function MarketFilters({ filters, searchValue, onSearchChange, onFilterChange, onReset, isFetching }) {
  const hasActiveFilters = Boolean(searchValue || filters.signal || filters.rugStatus || filters.minScore || filters.sort !== 'lastScannedAt' || filters.order !== 'desc' || filters.limit !== 20);

  return <section className="rounded-[2rem] bg-white p-5 shadow-card">
    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-extrabold">Market Scanner</h2>
        <p className="text-sm text-slate-500">Read-only token scan results from local database.</p>
      </div>
      {isFetching && <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Updating data...</span>}
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <label className="xl:col-span-2">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Search</span>
        <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder="Symbol, name, or address" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500" />
      </label>
      <Select label="Signal" value={filters.signal || ''} onChange={(value) => onFilterChange({ signal: value || null, page: 1 })} options={SIGNAL_OPTIONS} allLabel="All signals" />
      <Select label="Rug Status" value={filters.rugStatus || ''} onChange={(value) => onFilterChange({ rugStatus: value || null, page: 1 })} options={RUG_STATUS_OPTIONS} allLabel="All risk" />
      <label>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Minimum Score</span>
        <select value={filters.minScore || ''} onChange={(event) => onFilterChange({ minScore: event.target.value ? Number(event.target.value) : null, page: 1 })} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          <option value="">All scores</option>
          {MIN_SCORE_OPTIONS.map((score) => <option key={score} value={score}>{score}+</option>)}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Page Size</span>
        <select value={filters.limit} onChange={(event) => onFilterChange({ limit: Number(event.target.value), page: 1 })} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto]">
      <label>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Sort</span>
        <select value={filters.sort} onChange={(event) => onFilterChange({ sort: event.target.value, page: 1 })} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Order</span>
        <select value={filters.order} onChange={(event) => onFilterChange({ order: event.target.value, page: 1 })} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
      <div className="flex items-end">
        <button type="button" onClick={onReset} disabled={!hasActiveFilters} className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto">Reset filters</button>
      </div>
    </div>
  </section>;
}

function Select({ label, value, onChange, options, allLabel }) {
  return <label>
    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500">
      <option value="">{allLabel}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>;
}
