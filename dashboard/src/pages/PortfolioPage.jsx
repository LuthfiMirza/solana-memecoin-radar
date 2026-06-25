import React, { useEffect, useMemo, useRef } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { HeaderBar } from '../components/HeaderBar';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { TokenDetailDrawer } from '../components/TokenDetailDrawer';
import { PortfolioFilters } from '../features/portfolio/PortfolioFilters';
import { ActivePositionsTable } from '../features/portfolio/ActivePositionsTable';
import { ClosedPositionsTable } from '../features/portfolio/ClosedPositionsTable';
import { PortfolioMobileList } from '../features/portfolio/PortfolioMobileList';
import { fetchPortfolio } from '../lib/api';
import { POLL_INTERVAL_MS } from '../lib/constants';
import { queryKeys } from '../lib/queryKeys';

const DEFAULTS = { status: 'ACTIVE', sort: 'openedAt', order: 'desc', page: 1, limit: 20, token: null };
const STATUSES = new Set(['ACTIVE', 'CLOSED']);
const SORTS = new Set(['openedAt', 'closedAt', 'pnlPercent']);
const ORDERS = new Set(['asc', 'desc']);
const LIMITS = new Set([10, 20, 50]);

export function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = useMemo(() => parseParams(searchParams), [searchParams]);
  const returnFocusRef = useRef(null);
  useEffect(() => {
    const canonical = new URLSearchParams();
    const defaultSort = parsed.status === 'CLOSED' ? 'closedAt' : DEFAULTS.sort;
    setParam(canonical, 'status', parsed.status, DEFAULTS.status);
    setParam(canonical, 'sort', parsed.sort, defaultSort);
    setParam(canonical, 'order', parsed.order, DEFAULTS.order);
    setParam(canonical, 'page', parsed.page, DEFAULTS.page);
    setParam(canonical, 'limit', parsed.limit, DEFAULTS.limit);
    setParam(canonical, 'token', parsed.token, DEFAULTS.token);
    if (canonical.toString() !== searchParams.toString()) setSearchParams(canonical, { replace: true });
  }, [parsed, searchParams, setSearchParams]);
  const listFilters = useMemo(() => ({ status: parsed.status, sort: parsed.sort, order: parsed.order, page: parsed.page, limit: parsed.limit }), [parsed]);
  const portfolioQuery = useQuery({
    queryKey: queryKeys.portfolio.list(listFilters),
    queryFn: ({ signal }) => fetchPortfolio(listFilters, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10000,
    retry: (failureCount, error) => error?.status && error.status < 500 ? false : failureCount < 1,
    refetchIntervalInBackground: false
  });
  const rows = portfolioQuery.data?.data || [];
  const pagination = portfolioQuery.data?.pagination;
  useEffect(() => { if (pagination?.totalPages && parsed.page > pagination.totalPages) updateParams({ page: pagination.totalPages }); }, [pagination?.totalPages, parsed.page]);

  function updateParams(updates) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      const merged = { ...parsed, ...updates };
      const defaultSort = merged.status === 'CLOSED' ? 'closedAt' : DEFAULTS.sort;
      setParam(next, 'status', merged.status, DEFAULTS.status);
      setParam(next, 'sort', merged.sort, defaultSort);
      setParam(next, 'order', merged.order, DEFAULTS.order);
      setParam(next, 'page', merged.page, DEFAULTS.page);
      setParam(next, 'limit', merged.limit, DEFAULTS.limit);
      setParam(next, 'token', merged.token, DEFAULTS.token);
      return next;
    });
  }
  function openDetail(address, element) { returnFocusRef.current = element; updateParams({ token: address }); }
  function closeDetail() { updateParams({ token: null }); }

  const isInitialLoading = portfolioQuery.isLoading && !portfolioQuery.data;
  const isBackgroundError = portfolioQuery.isError && Boolean(portfolioQuery.data);
  const emptyTitle = parsed.status === 'ACTIVE' ? 'No active tracked positions.' : 'No closed tracked positions yet.';
  const emptyMessage = parsed.status === 'ACTIVE' ? 'Positions recorded by the bot will appear here.' : 'Closed positions recorded by the bot will appear here.';
  return <>
    <HeaderBar title="Tracked Portfolio" subtitle="Monitor positions recorded by the scanner bot." />
    <div className="space-y-5 overflow-x-hidden">
      <PortfolioFilters filters={parsed} onChange={updateParams} disabled={portfolioQuery.isFetching && !portfolioQuery.data} />
      {portfolioQuery.isFetching && portfolioQuery.data && <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><RefreshCw className="h-3 w-3 animate-spin" />Updating</div>}
      {isBackgroundError && <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Could not refresh portfolio. Showing cached data.</div>}
      {isInitialLoading && <div role="status" aria-live="polite"><span className="sr-only">Loading tracked portfolio</span><LoadingSkeleton rows={4} /></div>}
      {portfolioQuery.isError && !portfolioQuery.data && <ErrorState title="Failed to load portfolio" message={portfolioQuery.error?.message} onRetry={() => portfolioQuery.refetch()} />}
      {!isInitialLoading && !portfolioQuery.isError && rows.length === 0 && <EmptyState title={emptyTitle} message={emptyMessage} />}
      {rows.length > 0 && <>{parsed.status === 'ACTIVE' ? <ActivePositionsTable rows={rows} onOpenDetail={openDetail} /> : <ClosedPositionsTable rows={rows} onOpenDetail={openDetail} />}<PortfolioMobileList rows={rows} status={parsed.status} onOpenDetail={openDetail} /><Pagination pagination={pagination} onPageChange={(page) => updateParams({ page })} onLimitChange={(limit) => updateParams({ limit, page: 1 })} disabled={portfolioQuery.isFetching && !portfolioQuery.data} /></>}
    </div>
    {parsed.token && <TokenDetailDrawer address={parsed.token} onClose={closeDetail} returnFocusRef={returnFocusRef} />}
  </>;
}

function parseParams(params) { const status = normalizeEnum(params.get('status'), STATUSES) || DEFAULTS.status; const defaultSort = status === 'CLOSED' ? 'closedAt' : DEFAULTS.sort; const sort = SORTS.has(params.get('sort')) ? params.get('sort') : defaultSort; const normalizedSort = status === 'ACTIVE' && sort === 'closedAt' ? 'openedAt' : sort; const order = ORDERS.has((params.get('order') || '').toLowerCase()) ? params.get('order').toLowerCase() : DEFAULTS.order; const limit = LIMITS.has(Number(params.get('limit'))) ? Number(params.get('limit')) : DEFAULTS.limit; const page = Math.max(1, Number.parseInt(params.get('page') || DEFAULTS.page, 10) || DEFAULTS.page); return { status, sort: normalizedSort, order, page, limit, token: params.get('token') || null }; }
function normalizeEnum(value, allowed) { if (!value) return null; const normalized = value.toUpperCase(); return allowed.has(normalized) ? normalized : null; }
function setParam(params, key, value, defaultValue) { if (value === null || value === undefined || value === '' || value === defaultValue) params.delete(key); else params.set(key, String(value)); }
