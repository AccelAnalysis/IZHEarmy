import { json } from './http.mjs';

/**
 * Legacy compatibility sentinel.
 *
 * IZHE Admin v2 does not authorize through this module. Every supported
 * administrative endpoint must use admin-auth-v2.mjs and declare a permission.
 * This file intentionally fails closed so an overlooked legacy import cannot
 * revive the retired shared-token authentication path.
 */
export function isAdmin() {
  return false;
}

export function requireAdmin() {
  return json({ error: 'Legacy administrator authentication is disabled.' }, 503);
}
