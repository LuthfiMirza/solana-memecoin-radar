import React from 'react';
import { HeaderBar } from '../components/HeaderBar';
export function PlaceholderPage({ title }) { return <><HeaderBar title={title} subtitle="Coming in the next phase. This MVP phase only completes the Overview page and prepares stable API contracts." /><div className="rounded-[2rem] bg-white p-8 text-center shadow-card"><div className="text-xl font-extrabold text-slate-800">Coming in the next phase</div><p className="mt-2 text-sm text-slate-500">Endpoint contract is prepared, but this page UI is intentionally deferred.</p></div></>; }
