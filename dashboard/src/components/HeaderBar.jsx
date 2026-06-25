import React from 'react';
import { StatusBadge } from './StatusBadge';
export function HeaderBar({ title, subtitle, apiStatus, databaseStatus }) {
  return <header className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">{title}</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p></div><div className="flex flex-wrap gap-2"><StatusBadge status={apiStatus || 'unknown'}>API {apiStatus || 'unknown'}</StatusBadge><StatusBadge status={databaseStatus || 'unknown'}>DB {databaseStatus || 'unknown'}</StatusBadge></div></header>;
}
