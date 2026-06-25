const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
export async function fetchDashboard() {
  const response = await fetch(`${API_BASE}/api/dashboard`);
  if (!response.ok) throw new Error('Failed to load dashboard data');
  return response.json();
}
