import React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { HeaderBar } from '../components/HeaderBar';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { TokenDetailDrawer } from '../components/TokenDetailDrawer';
import { MarketFilters } from '../features/market/MarketFilters';
import { MarketScannerTable } from '../features/market/MarketScannerTable';
import { MarketScannerMobileList } from '../features/market/MarketScannerMobileList';
import { fetchTokens } from '../lib/api';
import { POLL_INTERVAL_MS, RUG_STATUS_OPTIONS, SIGNAL_OPTIONS, SORT_OPTIONS } from '../lib/constants';
import { queryKeys } from '../lib/queryKeys';
import { formatWib } from '../lib/format';

const DEFAULTS = { search: '', signal: null, rugStatus: null, minScore: null, sort: 'lastScannedAt', order: 'desc', page: 1, limit: 20, token: null };
const SORT_VALUES = new Set(SORT_OPTIONS.map((option) => option.value));
const ORDERS = new Set(['asc', 'desc']);
const LIMITS = new Set([10, 20, 50]);

export function MarketScannerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = useMemo(() => parseScannerParams(searchParams), [searchParams]);
  const [searchValue, setSearchValue] = useState(parsed.search);
  const returnFocusRef = useRef(null);

  useEffect(() => { setSearchValue(parsed.search); }, [parsed.search]);
  useEffect(() => {
    if (searchValue === parsed.search) return undefined;
    const timeout = window.setTimeout(() => updateParams({ search: searchValue.trim() || null, page: 1 }), 400);
    return () => window.clearTimeout(timeout);
  }, [searchValue, parsed.search]);

  const listFilters = useMemo(() => ({ search: parsed.search, signal: parsed.signal, minScore: parsed.minScore, rugStatus: parsed.rugStatus, sort: parsed.sort, order: parsed.order, page: parsed.page, limit: parsed.limit }), [parsed]);
  const tokensQuery = useQuery({
    queryKey: queryKeys.tokens.list(listFilters),
    queryFn: ({ signal }) => fetchTokens(listFilters, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10000,
    retry: (failureCount, error) => error?.status < 500 ? false : failureCount < 1,
    refetchIntervalInBackground: false
  });

  const rows = tokensQuery.data?.data || [];
  const pagination = tokensQuery.data?.pagination;
  const hasFilters = Boolean(parsed.search || parsed.signal || parsed.rugStatus || parsed.minScore);

  useEffect(() => {
    if (!pagination?.totalPages) return;
    if (parsed.page > pagination.totalPages) updateParams({ page: pagination.totalPages });
  }, [pagination?.totalPages, parsed.page]);

  function updateParams(updates) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      const merged = { ...parsed, ...updates };
      setParam(next, 'search', merged.search, DEFAULTS.search);
      setParam(next, 'signal', merged.signal, DEFAULTS.signal);
      setParam(next, 'rugStatus', merged.rugStatus, DEFAULTS.rugStatus);
      setParam(next, 'minScore', merged.minScore, DEFAULTS.minScore);
      setParam(next, 'sort', merged.sort, DEFAULTS.sort);
      setParam(next, 'order', merged.order, DEFAULTS.order);
      setParam(next, 'page', merged.page, DEFAULTS.page);
      setParam(next, 'limit', merged.limit, DEFAULTS.limit);
      setParam(next, 'token', merged.token, DEFAULTS.token);
      return next;
    });
  }

  function resetFilters() {
    setSearchValue('');
    updateParams({ search: null, signal: null, rugStatus: null, minScore: null, sort: DEFAULTS.sort, order: DEFAULTS.order, page: 1, limit: DEFAULTS.limit });
  }

  function openDetail(address, trigger) {
    returnFocusRef.current = trigger || null;
    updateParams({ token: address });
  }

  function closeDetail() { updateParams({ token: null }); }

  return <>
    <HeaderBar title="Market Scanner" subtitle="Search, filter, and inspect token scan snapshots. Read-only database view." />
    <div className="space-y-5">
      <MarketFilters filters={parsed} searchValue={searchValue} onSearchChange={setSearchValue} onFilterChange={updateParams} onReset={resetFilters} isFetching={tokensQuery.isFetching && !tokensQuery.isLoading} />
      {tokensQuery.isError && tokensQuery.data && <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">Background refresh failed. Showing cached token data. <button type="button" onClick={() => tokensQuery.refetch()} className="ml-2 inline-flex items-center gap-1 font-bold"><RefreshCw className="h-3 w-3" />Retry</button></div>}
      {tokensQuery.isLoading && <LoadingSkeleton rows={6} />}
      {tokensQuery.isError && !tokensQuery.data && <ErrorState message={tokensQuery.error?.message} onRetry={() => tokensQuery.refetch()} />}
      {tokensQuery.data && <>
        <div className="flex flex-col gap-2 text-sm text-slate-500 md:flex-row md:items-center md:justify-between"><span>Last updated: {formatWib(tokensQuery.data.meta?.generatedAt, 'Unknown')}</span>{tokensQuery.isFetching && !tokensQuery.isLoading && <span className="font-bold text-blue-700">Refreshing latest snapshot...</span>}</div>
        {rows.length === 0 ? <EmptyState title={hasFilters ? 'No tokens match the current filters.' : 'No token scan data is available yet.'} message={hasFilters ? 'Try clearing filters or lowering the minimum score.' : 'Scanner results will appear after token scans are stored.'} action={hasFilters ? <button type="button" onClick={resetFilters} className="rounded-2xl bg-navy px-4 py-2 text-sm font-bold text-white">Reset filters</button> : null} /> : <>
          <MarketScannerTable rows={rows} onOpenDetail={openDetail} />
          <MarketScannerMobileList rows={rows} onOpenDetail={openDetail} />
          <Pagination pagination={pagination} onPageChange={(page) => updateParams({ page })} onLimitChange={(limit) => updateParams({ limit, page: 1 })} disabled={tokensQuery.isFetching && !tokensQuery.data} />
        </>}
      </>}
    </div>
    <TokenDetailDrawer address={parsed.token} onClose={closeDetail} returnFocusRef={returnFocusRef} />
  </>;
}

function parseScannerParams(params) {
  const signal = normalizeEnum(params.get('signal'), SIGNAL_OPTIONS);
  const rugStatus = normalizeEnum(params.get('rugStatus'), RUG_STATUS_OPTIONS);
  const minScore = normalizeMinScore(params.get('minScore'));
  const sort = SORT_VALUES.has(params.get('sort')) ? params.get('sort') : DEFAULTS.sort;
  const order = ORDERS.has(params.get('order')) ? params.get('order') : DEFAULTS.order;
  const page = normalizeInteger(params.get('page'), DEFAULTS.page, 1, 999999);
  const limit = LIMITS.has(Number(params.get('limit'))) ? Number(params.get('limit')) : DEFAULTS.limit;
  const search = (params.get('search') || '').trim();
  const token = (params.get('token') || '').trim() || null;
  return { search, signal, rugStatus, minScore, sort, order, page, limit, token };
}
function normalizeEnum(value, allowed) { if (!value) return null; const upper = value.toUpperCase(); return allowed.includes(upper) ? upper : null; }
function normalizeMinScore(value) { if (!value) return null; const number = Number(value); return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null; }
function normalizeInteger(value, fallback, min, max) { const number = Number(value); return Number.isInteger(number) && number >= min && number <= max ? number : fallback; }
function setParam(params, key, value, defaultValue) { if (value === null || value === undefined || value === '' || value === defaultValue) params.delete(key); else params.set(key, String(value)); }
