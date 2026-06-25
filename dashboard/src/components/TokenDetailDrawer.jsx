import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import { fetchTokenDetail } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { SignalBadge } from './SignalBadge';
import { StatusBadge } from './StatusBadge';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { compactUsd, formatNumber, formatPercent, formatRatio, formatUsd, formatWib, shortAddress } from '../lib/format';

export function TokenDetailDrawer({ address, onClose, returnFocusRef }) {
  const closeButtonRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const detailQuery = useQuery({
    queryKey: queryKeys.tokens.detail(address),
    queryFn: ({ signal }) => fetchTokenDetail(address, { signal }),
    enabled: Boolean(address),
    retry: (failureCount, error) => ![400, 404].includes(error?.status) && failureCount < 1
  });

  useEffect(() => {
    if (!address) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timeout = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef?.current?.focus?.();
    };
  }, [address, onClose, returnFocusRef]);

  if (!address) return null;
  const token = detailQuery.data?.data;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Token detail drawer">
    <button type="button" aria-label="Close token detail overlay" className="absolute inset-0 h-full w-full cursor-default bg-slate-950/40" onClick={onClose} />
    <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-l-[2rem]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">{token?.signal && <SignalBadge signal={token.signal} />}{token?.rugStatus && <StatusBadge status={token.rugStatus}>{token.rugStatus}</StatusBadge>}</div>
          <h2 className="truncate text-2xl font-black text-slate-950">{token?.name || 'Token detail'}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500"><span>{token?.symbol || '—'}</span><span>·</span><span>{shortAddress(address)}</span><button type="button" onClick={copyAddress} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}</button></div>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-3 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label="Close token detail"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {detailQuery.isLoading && <LoadingSkeleton rows={5} />}
        {detailQuery.isError && <DetailError error={detailQuery.error} onRetry={() => detailQuery.refetch()} />}
        {token && <div className="space-y-5">
          <section className="rounded-3xl bg-slate-50 p-4"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Scanner Metrics</h3><div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Score" value={token.score ?? '—'} />
            <Metric label="Rug Score" value={token.rugScore ?? '—'} />
            <Metric label="Price" value={formatUsd(token.priceUsd)} />
            <Metric label="Liquidity" value={compactUsd(token.liquidityUsd)} />
            <Metric label="Volume 24h" value={compactUsd(token.volume24hUsd)} />
            <Metric label="Market Cap" value={compactUsd(token.marketCapUsd)} />
            <Metric label="Top Holder" value={token.topHolderPercent !== null && token.topHolderPercent !== undefined ? formatPercent(token.topHolderPercent, { signed: false }) : '—'} />
            <Metric label="Buy/Sell Ratio" value={formatRatio(token.buySellRatio)} />
            <Metric label="Smart Wallets" value={formatNumber(token.smartWalletCount)} />
            <Metric label="Whale Entries" value={formatNumber(token.whaleEntryCount)} />
            <Metric label="First Seen" value={formatWib(token.firstSeenAt, '—')} />
            <Metric label="Last Scanned" value={formatWib(token.lastScannedAt, '—')} />
          </div></section>
          <section className="rounded-3xl bg-white p-4 ring-1 ring-slate-100"><h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">AI Summary</h3>{token.aiSummary ? <><p className="text-sm leading-6 text-slate-700">{token.aiSummary}</p><p className="mt-3 text-xs text-slate-400">Summary ini bersifat informatif dan bukan financial advice.</p></> : <EmptyState title="No AI summary" message="AI summary is not available for this token." />}</section>
          <section className="rounded-3xl bg-white p-4 ring-1 ring-slate-100"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">External Links</h3><div className="flex flex-wrap gap-2"><SafeLink href={token.links?.dexScreener}>DexScreener</SafeLink><SafeLink href={token.links?.rugCheck}>RugCheck</SafeLink></div></section>
          {token.rawJson ? <details className="rounded-3xl bg-slate-950 p-4 text-white"><summary className="cursor-pointer text-sm font-black">Raw JSON</summary><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">{formatRawJson(token.rawJson)}</pre></details> : <section className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-500">Raw data is not exposed by API.</section>}
        </div>}
      </div>
    </aside>
  </div>;
}

function Metric({ label, value }) { return <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 break-words font-extrabold text-slate-950">{value}</div></div>; }
function DetailError({ error, onRetry }) {
  const message = error?.status === 404 ? 'Token not found.' : error?.status === 400 ? 'Invalid token address.' : 'Failed to load token detail.';
  return <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-red-800"><div className="font-extrabold">{message}</div><p className="mt-1 text-sm">{error?.message || 'Please try again.'}</p><button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" />Retry</button></div>;
}
function SafeLink({ href, children }) { if (!href) return null; return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-700 hover:bg-blue-100">{children}<ExternalLink className="h-4 w-4" /></a>; }
function formatRawJson(rawJson) { try { return JSON.stringify(typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson, null, 2); } catch { return String(rawJson); } }
