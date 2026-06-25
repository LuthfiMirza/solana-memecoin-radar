import React from 'react';
export function ErrorState({ title = 'Data gagal dimuat', message, onRetry }) {
  return <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800"><h2 className="text-lg font-extrabold">{title}</h2><p className="mt-2 text-sm">{message || 'Terjadi error saat mengambil data.'}</p>{onRetry && <button type="button" onClick={onRetry} aria-label="Retry loading data" className="mt-4 rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white">Retry</button>}</div>;
}
