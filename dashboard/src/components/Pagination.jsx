import React from 'react';
import { PAGE_SIZE_OPTIONS } from '../lib/constants';

export function Pagination({ pagination, onPageChange, onLimitChange, disabled }) {
  const page = pagination?.page || 1;
  const totalPages = pagination?.totalPages || 0;
  const total = pagination?.total || 0;
  const limit = pagination?.limit || 20;

  const hasPages = totalPages > 0;

  return <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between">
    <div className="text-sm text-slate-500">{hasPages ? <>Showing page <b className="text-slate-900">{page}</b> of <b className="text-slate-900">{totalPages}</b></> : <b className="text-slate-900">No pages</b>} · {total.toLocaleString('en-US')} records</div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm font-semibold text-slate-500" htmlFor="page-size">Page size</label>
      <select id="page-size" value={limit} onChange={(event) => onLimitChange(Number(event.target.value))} disabled={disabled} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500">
        {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={disabled || !pagination?.hasPreviousPage} aria-disabled={disabled || !pagination?.hasPreviousPage} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={disabled || !pagination?.hasNextPage} aria-disabled={disabled || !pagination?.hasNextPage} className="rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Next</button>
    </div>
  </div>;
}
