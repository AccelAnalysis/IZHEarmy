import crypto from 'node:crypto';

export function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export function createGiveCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let token = '';
  for (let i = 0; i < 8; i += 1) token += alphabet[bytes[i] % alphabet.length];
  return `IZHE-${token.slice(0, 4)}-${token.slice(4)}`;
}

export function createConfirmation(prefix = 'IZHE') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
