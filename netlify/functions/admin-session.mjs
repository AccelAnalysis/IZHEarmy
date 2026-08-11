import { requestId, withSecurityHeaders } from './_shared/admin-crypto.mjs';
import { checkAdminRateLimit, rateLimitHeaders } from './_shared/admin-rate-limit.mjs';
import { adminSessionConfiguration, currentSessionPayload, loadAdminSession } from './_shared/admin-session-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const id = requestId(request);
  const rate = await checkAdminRateLimit(request, null, 'session');
  if (!rate.allowed) {
    return withSecurityHeaders(json({ error: 'Administrator session validation is temporarily rate limited.', requestId: id }, 429), {
      requestId: id,
      headers: rateLimitHeaders(rate)
    });
  }

  const configuration = adminSessionConfiguration();
  if (!configuration.configured) {
    return withSecurityHeaders(json({
      authenticated: false,
      configured: false,
      error: 'Administrator identity is not configured.',
      requestId: id
    }, 503), { requestId: id, headers: rateLimitHeaders(rate) });
  }

  try {
    const context = await loadAdminSession(request);
    const payload = context
      ? { configured: true, ...currentSessionPayload(context) }
      : { configured: true, authenticated: false, loginUrl: '/.netlify/functions/admin-login?returnTo=%2Fadmin%2F' };
    return withSecurityHeaders(json(payload), { requestId: id, headers: rateLimitHeaders(rate) });
  } catch (error) {
    console.error('admin-session', { requestId: id, message: error.message });
    return withSecurityHeaders(json({
      authenticated: false,
      configured: true,
      error: 'Administrator session could not be validated.',
      requestId: id
    }, 503), { requestId: id, headers: rateLimitHeaders(rate) });
  }
};
