import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '../../components/EmptyState';
export function ScoreDistributionChart({ rows = [] }) {
  const hasData = rows.some((row) => Number(row.count) > 0);
  return <section className="rounded-[2rem] bg-white p-6 shadow-card"><div className="mb-5"><h2 className="text-lg font-extrabold">Score Distribution — Latest Snapshot</h2><p className="text-sm text-slate-500">Bucket count from current token rows. This is not a historical trend or AI prediction.</p></div>{hasData ? <ResponsiveContainer width="100%" height={280}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="bucket" stroke="#94A3B8" fontSize={12} /><YAxis allowDecimals={false} stroke="#94A3B8" fontSize={12} /><Tooltip /><Bar dataKey="count" name="Tokens" fill="#2563EB" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No score data" message="Score distribution will appear after tokens are scanned." />}</section>;
}
