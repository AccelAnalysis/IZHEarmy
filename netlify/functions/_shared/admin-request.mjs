import { cleanText } from './http.mjs';

export async function readJsonBody(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object body required.');
    return value;
  } catch {
    throw Object.assign(new Error('A valid JSON object body is required.'), { statusCode: 400 });
  }
}

export function text(value, max = 500) {
  return cleanText(value, max);
}

export function identifier(value, max = 160) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:@+-]/g, '').slice(0, max);
}

export function boundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function stringArray(value, { maxItems = 100, maxLength = 160 } = {}) {
  return [...new Set((Array.isArray(value) ? value : []).slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean))];
}

export function requiredExplanation(value, min = 10, max = 1_000) {
  const explanation = text(value, max);
  if (explanation.length < min) {
    throw Object.assign(new Error(`An explanation of at least ${min} characters is required.`), { statusCode: 400 });
  }
  return explanation;
}

export function paginationFromUrl(request, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const url = new URL(request.url);
  return {
    cursor: text(url.searchParams.get('cursor'), 500),
    limit: boundedInteger(url.searchParams.get('limit'), defaultLimit, { min: 1, max: maxLimit }),
    search: text(url.searchParams.get('search'), 200),
    status: text(url.searchParams.get('status'), 100),
    dateFrom: text(url.searchParams.get('dateFrom'), 40),
    dateTo: text(url.searchParams.get('dateTo'), 40),
    campaignId: text(url.searchParams.get('campaignId'), 160),
    sort: text(url.searchParams.get('sort'), 80)
  };
}

export function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    throw Object.assign(new Error('The pagination cursor is invalid.'), { statusCode: 400 });
  }
}
