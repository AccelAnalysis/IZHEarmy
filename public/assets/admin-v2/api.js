let currentSession = null;

function normalizeFunctionName(name) {
  const value = String(name || '').trim();
  if (!value) throw new Error('A Netlify function name is required.');
  if (value.startsWith('/')) return value;
  return `/.netlify/functions/${encodeURIComponent(value)}`;
}

export function functionUrl(name, params = {}) {
  const base = normalizeFunctionName(name);
  const url = new URL(base, window.location.origin);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

export function setSession(session) {
  currentSession = session || null;
  return currentSession;
}

export function getSession() {
  return currentSession;
}

function jsonBody(body) {
  if (body === undefined || body === null) return undefined;
  return typeof body === 'string' || body instanceof FormData || body instanceof Blob ? body : JSON.stringify(body);
}

function requestHeaders(method, body, supplied = {}) {
  const headers = new Headers(supplied || {});
  const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || 'GET').toUpperCase());
  if (body !== undefined && body !== null && !(body instanceof FormData) && !(body instanceof Blob) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (mutation && currentSession?.csrfToken && !headers.has('x-izhe-csrf-token')) {
    headers.set('x-izhe-csrf-token', currentSession.csrfToken);
  }
  headers.set('accept', headers.get('accept') || 'application/json');
  return headers;
}

async function responsePayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => ({}));
  const text = await response.text().catch(() => '');
  return text ? { error: text } : {};
}

function apiError(response, payload) {
  const error = new Error(payload?.error || payload?.message || `Administrative request failed with status ${response.status}.`);
  error.name = 'AdminApiError';
  error.status = response.status;
  error.requestId = payload?.requestId || response.headers.get('x-request-id') || '';
  error.retryAfter = response.headers.get('retry-after') || '';
  error.code = payload?.code || '';
  if (response.headers.get('x-izhe-step-up-required') === 'true') error.code = 'recent_auth_required';
  if (response.status === 401) {
    error.code ||= 'not_authenticated';
    window.dispatchEvent(new CustomEvent('izhe:admin-session-expired', { detail: { requestId: error.requestId } }));
  } else if (response.status === 403) {
    error.code ||= 'not_authorized';
  } else if (response.status === 409) {
    error.code ||= 'conflict';
  } else if (response.status === 429) {
    error.code ||= 'rate_limited';
  }
  return error;
}

export async function api(url, {
  method = 'GET',
  body,
  headers,
  signal,
  redirect = 'follow'
} = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const encodedBody = jsonBody(body);
  const response = await fetch(url, {
    method: normalizedMethod,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect,
    headers: requestHeaders(normalizedMethod, body, headers),
    body: ['GET', 'HEAD'].includes(normalizedMethod) ? undefined : encodedBody,
    signal
  });
  const data = await responsePayload(response);
  if (!response.ok) throw apiError(response, data);
  return { data, response };
}

export async function readSession() {
  const { data } = await api('/.netlify/functions/admin-session');
  return data;
}

export async function logout() {
  const result = await api('/.netlify/functions/admin-logout', { method: 'POST', body: {} });
  currentSession = null;
  return result.data;
}

export function stepUp(returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`) {
  window.location.assign(functionUrl('admin-step-up', { returnTo }));
}

function filenameFromDisposition(value) {
  const header = String(value || '');
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) {
    try { return decodeURIComponent(utf[1].replace(/^"|"$/g, '')); } catch {}
  }
  const basic = header.match(/filename="?([^";]+)"?/i);
  return basic?.[1]?.trim() || '';
}

export async function downloadFromApi(url, {
  method = 'POST',
  body,
  headers,
  filename = 'izhe-export.csv'
} = {}) {
  const normalizedMethod = String(method || 'POST').toUpperCase();
  const response = await fetch(url, {
    method: normalizedMethod,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: requestHeaders(normalizedMethod, body, headers),
    body: ['GET', 'HEAD'].includes(normalizedMethod) ? undefined : jsonBody(body)
  });
  if (!response.ok) {
    const payload = await responsePayload(response);
    throw apiError(response, payload);
  }
  const blob = await response.blob();
  const serverName = filenameFromDisposition(response.headers.get('content-disposition'));
  const safeName = String(serverName || filename || 'izhe-export').replace(/[\\/:*?"<>|\r\n]/g, '-').slice(0, 180);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = safeName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
  return safeName;
}
