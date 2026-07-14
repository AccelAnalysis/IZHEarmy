import { json } from './http.mjs';

export function adminToken(request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
}

export function isAdmin(request) {
  const expected = process.env.IZHE_ADMIN_TOKEN || '';
  return Boolean(expected) && adminToken(request) === expected;
}

export function requireAdmin(request) {
  return isAdmin(request) ? null : json({ error: 'Unauthorized.' }, 401);
}
