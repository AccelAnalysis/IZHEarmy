import { getStore } from '@netlify/blobs';
import { minimizedIpReference, sha256 } from './admin-crypto.mjs';

const STORE_NAME = 'izhe-admin-rate-limits';
const store = () => getStore(STORE_NAME);

export const RATE_LIMITS = Object.freeze({
  login: { limit: 20, windowSeconds: 10 * 60 },
  callback: { limit: 20, windowSeconds: 10 * 60 },
  session: { limit: 120, windowSeconds: 60 },
  read: { limit: 240, windowSeconds: 60 },
  write: { limit: 80, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 10 * 60 },
  export: { limit: 10, windowSeconds: 60 * 60 },
  bulk: { limit: 10, windowSeconds: 60 * 60 },
  denied: { limit: 30, windowSeconds: 5 * 60 }
});

function rateKey(request, context, rateClass, windowStart) {
  const identity = context?.userId || minimizedIpReference(request);
  return `limits/${rateClass}/${windowStart}/${sha256(identity).slice(0, 32)}.json`;
}

export async function checkAdminRateLimit(request, context, rateClass = 'read') {
  const policy = RATE_LIMITS[rateClass] || RATE_LIMITS.read;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
  const key = rateKey(request, context, rateClass, windowStart);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const entry = await store().getWithMetadata(key, { type: 'json', consistency: 'strong' }).catch(() => null);
    const current = Math.max(0, Number(entry?.data?.count || 0));
    if (current >= policy.limit) {
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        retryAfter: Math.max(1, windowStart + policy.windowSeconds - nowSeconds)
      };
    }
    const next = {
      count: current + 1,
      windowStart,
      expiresAt: new Date((windowStart + policy.windowSeconds) * 1000).toISOString()
    };
    const saved = entry?.etag
      ? await store().setJSON(key, next, { onlyIfMatch: entry.etag })
      : await store().setJSON(key, next, { onlyIfNew: true });
    if (saved.modified) {
      return {
        allowed: true,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - next.count),
        retryAfter: Math.max(1, windowStart + policy.windowSeconds - nowSeconds)
      };
    }
  }

  return { allowed: false, limit: policy.limit, remaining: 0, retryAfter: policy.windowSeconds };
}

export function rateLimitHeaders(result) {
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'retry-after': String(result.retryAfter)
  };
}
