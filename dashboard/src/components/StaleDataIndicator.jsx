import React from 'react';
import { formatWib } from '../lib/format';
export function StaleDataIndicator({ generatedAt, isFetching, isError }) { return <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>Last updated: {formatWib(generatedAt)}</span>{isFetching && <span className="rounded-full bg-blue-100 px-2 py-1 font-bold text-blue-700">Updating...</span>}{isError && <span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-700">Showing cached data</span>}</div>; }
