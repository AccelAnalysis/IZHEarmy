import { json, methodNotAllowed } from './http.mjs';
import { allowedAdminOrigins, requestId as createRequestId, withSecurityHeaders } from './admin-crypto.mjs';
import { appendAdminAuditEvent, auditDenied } from './admin-audit-service.mjs';
import { endpointPolicy, hasPermission } from './admin-permissions.mjs';
import { checkAdminRateLimit, rateLimitHeaders } from './admin-rate-limit.mjs';
import {
  loadAdminSession,
  recentAuthenticationSatisfied,
  validateCsrf
} from './admin-session-service.mjs';

const contexts = new WeakMap();
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizePolicy(request, permissionOrOptions) {
  const inferred = endpointPolicy(request);
  if (!permissionOrOptions) return inferred;
  if (typeof permissionOrOptions === 'string') return { ...(inferred || {}), permission: permissionOrOptions };
  return { ...(inferred || {}), ...permissionOrOptions };
}

function originAllowed(request) {
  const allowed = allowedAdminOrigins(request);
  const origin = request.headers.get('origin');
  if (origin) {
    try { return allowed.has(new URL(origin).origin); } catch { return false; }
  }
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try { return allowed.has(new URL(referer).origin); } catch { return false; }
}

function contentTypeAllowed(request, policy) {
  if (!policy.contentTypes?.length || !MUTATION_METHODS.has(request.method)) return true;
  const value = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return policy.contentTypes.some((allowed) => value === allowed || value.startsWith(`${allowed};`));
}

function bodySizeAllowed(request, policy) {
  if (!policy.maxBodyBytes || !MUTATION_METHODS.has(request.method)) return true;
  const length = Number(request.headers.get('content-length') || 0);
  return !Number.isFinite(length) || length <= policy.maxBodyBytes;
}

function errorResponse(message, status, id, headers = {}) {
  return withSecurityHeaders(json({ error: message, requestId: id }, status), { requestId: id, headers });
}

async function denied(request, id, context, policy, reason, status, message, headers = {}) {
  await auditDenied(request, id, context, policy?.auditAction || 'administration.denied', reason, {
    endpoint: new URL(request.url).pathname,
    method: request.method,
    permission: policy?.permission || null
  });
  return errorResponse(message, status, id, headers);
}

export async function authorizeAdminRequest(request, permissionOrOptions) {
  const id = createRequestId(request);
  const policy = normalizePolicy(request, permissionOrOptions);
  if (!policy?.permission || !Array.isArray(policy.methods) || !policy.methods.length) {
    return { response: errorResponse('Administrative endpoint security policy is incomplete.', 500, id), requestId: id, policy: null, context: null };
  }
  if (!policy.methods.includes(request.method)) {
    const response = methodNotAllowed(policy.methods);
    return { response: withSecurityHeaders(response, { requestId: id }), requestId: id, policy, context: null };
  }

  let context;
  try {
    context = await loadAdminSession(request);
  } catch (error) {
    const message = error?.configurationError
      ? 'Administrator identity is not configured.'
      : 'Administrator session could not be validated.';
    return { response: errorResponse(message, Number(error?.statusCode || 503), id), requestId: id, policy, context: null };
  }
  if (!context) {
    return { response: await denied(request, id, null, policy, 'not_authenticated', 401, 'Administrator authentication is required.'), requestId: id, policy, context: null };
  }
  if (!hasPermission(context.permissions, policy.permission)) {
    const limit = await checkAdminRateLimit(request, context, 'denied');
    return {
      response: await denied(request, id, context, policy, 'permission_denied', limit.allowed ? 403 : 429, limit.allowed ? 'You do not have permission to perform this action.' : 'Too many denied administrative requests.', rateLimitHeaders(limit)),
      requestId: id,
      policy,
      context
    };
  }

  const rate = await checkAdminRateLimit(request, context, policy.rateClass || (MUTATION_METHODS.has(request.method) ? 'write' : 'read'));
  if (!rate.allowed) {
    return {
      response: await denied(request, id, context, policy, 'rate_limited', 429, 'This administrative action is temporarily rate limited.', rateLimitHeaders(rate)),
      requestId: id,
      policy,
      context
    };
  }

  if ((MUTATION_METHODS.has(request.method) || policy.csrf) && !originAllowed(request)) {
    return { response: await denied(request, id, context, policy, 'invalid_origin', 403, 'Cross-origin administrative requests are not allowed.'), requestId: id, policy, context };
  }
  if (policy.csrf && !validateCsrf(request, context)) {
    return { response: await denied(request, id, context, policy, 'invalid_csrf', 403, 'The administrative request could not be verified.'), requestId: id, policy, context };
  }
  if (!contentTypeAllowed(request, policy)) {
    return { response: await denied(request, id, context, policy, 'invalid_content_type', 415, 'Unsupported administrative request content type.'), requestId: id, policy, context };
  }
  if (!bodySizeAllowed(request, policy)) {
    return { response: await denied(request, id, context, policy, 'body_too_large', 413, 'Administrative request body is too large.'), requestId: id, policy, context };
  }
  if (policy.recentAuth && !recentAuthenticationSatisfied(context)) {
    return { response: await denied(request, id, context, policy, 'recent_authentication_required', 403, 'Recent administrator authentication is required.', { 'x-izhe-step-up-required': 'true' }), requestId: id, policy, context };
  }

  contexts.set(request, { ...context, requestId: id, policy, rateLimit: rate });
  return { response: null, requestId: id, policy, context };
}

/**
 * Compatibility guard for existing administrative functions. Existing handlers
 * must await this function. The endpoint policy is still explicit and
 * centralized, so a forgotten or unmapped function fails closed.
 */
export async function requireAdmin(request, permissionOrOptions) {
  const authorized = await authorizeAdminRequest(request, permissionOrOptions);
  if (authorized.response) return authorized.response;
  if (authorized.policy.rateClass !== 'read') {
    await appendAdminAuditEvent({
      request,
      requestId: authorized.requestId,
      context: authorized.context,
      action: authorized.policy.auditAction,
      resourceType: 'administrative_endpoint',
      resourceId: new URL(request.url).pathname,
      result: 'authorized',
      reason: 'Legacy handler authorization passed; the underlying immutable business records retain operation-specific history.'
    }).catch((error) => console.error('admin-authorized-audit', { requestId: authorized.requestId, message: error.message }));
  }
  return null;
}

export async function isAdmin(request, permission = 'overview.read') {
  try {
    const context = await loadAdminSession(request, { touch: false });
    if (!context || !hasPermission(context.permissions, permission)) return false;
    contexts.set(request, context);
    return true;
  } catch {
    return false;
  }
}

export function getAdminContext(request) {
  return contexts.get(request) || null;
}

function safeError(error, requestId) {
  const status = Number(error?.statusCode || 500);
  const known = [400, 401, 403, 404, 409, 413, 415, 422, 429, 503].includes(status);
  return errorResponse(known ? (error.publicMessage || error.message || 'Administrative request failed.') : 'Administrative request failed.', known ? status : 500, requestId, error?.retryAfter ? { 'retry-after': String(error.retryAfter) } : {});
}

/**
 * Canonical wrapper for new and migrated administrative endpoints.
 * Handlers may return a Response or `{ response, audit }` where `audit` contains
 * resource/before/after metadata. All responses are forced to `no-store`.
 */
export function adminEndpoint(options, handler) {
  return async (request) => {
    const authorized = await authorizeAdminRequest(request, options);
    if (authorized.response) return authorized.response;
    try {
      const result = await handler(request, authorized.context, authorized.requestId);
      const response = result?.response instanceof Response ? result.response : result;
      if (!(response instanceof Response)) throw new Error('Administrative endpoint did not return a Response.');
      const audit = result?.audit || {};
      await appendAdminAuditEvent({
        request,
        requestId: authorized.requestId,
        context: authorized.context,
        action: options.auditAction || authorized.policy.auditAction,
        resourceType: audit.resourceType || 'administrative_endpoint',
        resourceId: audit.resourceId || null,
        result: audit.result || (response.ok ? 'success' : 'failure'),
        reason: audit.reason || '',
        beforeSummary: audit.beforeSummary || null,
        afterSummary: audit.afterSummary || null,
        metadata: audit.metadata || null
      });
      return withSecurityHeaders(response, { requestId: authorized.requestId, headers: rateLimitHeaders(authorized.context.rateLimit || authorized.rateLimit || { limit: 0, remaining: 0, retryAfter: 0 }) });
    } catch (error) {
      console.error('admin-endpoint', { requestId: authorized.requestId, action: options.auditAction, message: error.message });
      await appendAdminAuditEvent({
        request,
        requestId: authorized.requestId,
        context: authorized.context,
        action: options.auditAction || authorized.policy.auditAction,
        resourceType: 'administrative_endpoint',
        result: 'failure',
        reason: String(error?.message || 'Administrative endpoint failed.').slice(0, 1_000)
      }).catch(() => null);
      return safeError(error, authorized.requestId);
    }
  };
}
