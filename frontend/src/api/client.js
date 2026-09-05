const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

async function request(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
  });
  if (!res.ok) {
    let message = `Request to ${path} failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // response wasn't JSON — keep the default message
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  // filters: { status, event_type, page, limit }
  getEvents: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    return request(`/api/events${qs ? `?${qs}` : ''}`);
  },
  getMetrics: () => request('/api/events/metrics'),
  getEvent: (id) => request(`/api/events/${id}`),
  health: () => request('/health'),
};
