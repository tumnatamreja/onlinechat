// NOTE: process.env.NEXT_PUBLIC_API_URL gets baked in at `next build` time,
// not at container runtime — so docker-compose `environment:` has no effect
// on it. We hardcode the server URL here instead, same approach as client/.
export const API_URL = 'http://78.17.71.141';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ghostline_token');
}

export function setToken(token: string) {
  localStorage.setItem('ghostline_token', token);
}

export function clearToken() {
  localStorage.removeItem('ghostline_token');
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
