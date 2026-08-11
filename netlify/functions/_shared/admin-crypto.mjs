import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = '__Host-izhe_admin_session';
export const ADMIN_LOGIN_COOKIE = '__Host-izhe_admin_login';

export function randomToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 16) throw new Error('Secure tokens require at least 16 random bytes.');
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value, encoding = 'base64url') {
  return createHash('sha256').update(String(value)).digest(encoding);
}

export function hmac256(secret, value, encoding = 'base64url') {
  if (!secret) throw new Error('A signing secret is required.');
  return createHmac('sha256', secret).update(String(value)).digest(encoding);
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function cleanIdentifier(value, max = 160) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:@+-]/g, '').slice(0, max);
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try { cookies[name] = decodeURIComponent(raw); } catch { cookies[name] = raw; }
  }
  return cookies;
}

export function cookie(name, value, {
  maxAge,
  expires,
  httpOnly = true,
  secure = true,
  sameSite = 'Strict',
  path = '/'
} = {}) {
  const pieces = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (Number.isFinite(maxAge)) pieces.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (expires instanceof Date) pieces.push(`Expires=${expires.toUTCString()}`);
  if (secure) pieces.push('Secure');
  if (httpOnly) pieces.push('HttpOnly');
  if (sameSite) pieces.push(`SameSite=${sameSite}`);
  return pieces.join('; ');
}

export function sessionCookie(value, maxAgeSeconds) {
  return cookie(ADMIN_SESSION_COOKIE, value, { maxAge: maxAgeSeconds, sameSite: 'Strict' });
}

export function clearSessionCookie() {
  return cookie(ADMIN_SESSION_COOKIE, '', { maxAge: 0, expires: new Date(0), sameSite: 'Strict' });
}

export function loginCookie(value, maxAgeSeconds = 600) {
  // Lax is required for a top-level redirect back from an external OIDC provider.
  return cookie(ADMIN_LOGIN_COOKIE, value, { maxAge: maxAgeSeconds, sameSite: 'Lax' });
}

export function clearLoginCookie() {
  return cookie(ADMIN_LOGIN_COOKIE, '', { maxAge: 0, expires: new Date(0), sameSite: 'Lax' });
}

export function intEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function safeReturnPath(value, fallback = '/admin/') {
  const text = String(value || '').trim();
  if (!text.startsWith('/') || text.startsWith('//') || text.includes('\\')) return fallback;
  try {
    const parsed = new URL(text, 'https://izhe.invalid');
    return parsed.origin === 'https://izhe.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function requestId(request) {
  const incoming = request?.headers?.get?.('x-request-id') || '';
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming) ? incoming : randomToken(18);
}

export function requestIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for') || '';
  return forwarded.split(',')[0]?.trim()
    || request?.headers?.get?.('x-nf-client-connection-ip')
    || request?.headers?.get?.('client-ip')
    || 'unknown';
}

export function minimizedIpReference(request) {
  const secret = process.env.IZHE_ADMIN_AUDIT_SIGNING_SECRET || process.env.IZHE_ADMIN_SESSION_SECRET || '';
  return secret ? hmac256(secret, requestIp(request)).slice(0, 24) : 'unavailable';
}

export function summarizeUserAgent(value) {
  const ua = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 400);
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Safari\//.test(ua) ? 'Safari'
          : 'Other';
  const platform = /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'macOS'
      : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
          : /Linux/.test(ua) ? 'Linux'
            : 'Unknown';
  return { browser, platform, rawHash: sha256(ua).slice(0, 20) };
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

const SECRET_KEYS = /(?:secret|token|password|cookie|authorization|clientSecret|codeVerifier|idToken|accessToken|refreshToken|sessionId|csrf)/i;
const PII_KEYS = /(?:street|addressLine|phone|pickupCode|trackingNumber)/i;

export function redact(value, { depth = 0, maxDepth = 5 } = {}) {
  if (depth > maxDepth) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, { depth: depth + 1, maxDepth }));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return value.slice(0, 500);
    return value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    if (SECRET_KEYS.test(key)) result[key] = '[redacted]';
    else if (PII_KEYS.test(key)) result[key] = item ? '[minimized]' : item;
    else if (/email/i.test(key) && typeof item === 'string') result[key] = maskEmail(item);
    else result[key] = redact(item, { depth: depth + 1, maxDepth });
  }
  return result;
}

export function maskEmail(value) {
  const email = normalizeEmail(value);
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `•••-•••-${digits.slice(-4)}` : '';
}

export function maskCode(value) {
  const text = String(value || '').trim();
  return text ? `••••${text.slice(-4)}` : '';
}

export function allowedAdminOrigins(request) {
  const origins = new Set();
  try { origins.add(new URL(request.url).origin); } catch {}
  for (const source of [process.env.SITE_URL, ...(process.env.IZHE_ADMIN_ALLOWED_ORIGINS || '').split(',')]) {
    if (!source) continue;
    try { origins.add(new URL(source.trim()).origin); } catch {}
  }
  return origins;
}

export function withSecurityHeaders(response, { requestId: id, headers = {} } = {}) {
  const next = new Headers(response.headers);
  next.set('cache-control', 'no-store');
  next.set('pragma', 'no-cache');
  next.set('x-content-type-options', 'nosniff');
  if (id) next.set('x-request-id', id);
  for (const [name, value] of Object.entries(headers)) next.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: next });
}
