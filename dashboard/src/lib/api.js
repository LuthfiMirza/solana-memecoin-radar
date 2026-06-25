const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || {};
  }
}

async function requestJson(path, { signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error || {};
    throw new ApiError(error.message || 'Request failed', {
      status: response.status,
      code: error.code,
      details: error.details
    });
  }

  return payload;
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function fetchDashboard({ signal } = {}) {
  return requestJson('/api/dashboard', { signal });
}

export async function fetchTokens(filters = {}, { signal } = {}) {
  return requestJson(`/api/tokens${buildQuery(filters)}`, { signal });
}

export async function fetchSignals(filters = {}, { signal } = {}) {
  return requestJson(`/api/signals${buildQuery(filters)}`, { signal });
}

export async function fetchPortfolio(filters = {}, { signal } = {}) {
  return requestJson(`/api/portfolio${buildQuery(filters)}`, { signal });
}

export async function fetchTokenDetail(address, { signal } = {}) {
  return requestJson(`/api/tokens/${encodeURIComponent(address)}`, { signal });
}
