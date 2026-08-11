import { appendAdminAuditEvent } from './_shared/admin-audit-service.mjs';
import { requestId } from './_shared/admin-crypto.mjs';
import { beginAdministratorLogin, genericAuthenticationError } from './_shared/admin-oidc-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const id = requestId(request);
  try {
    const url = new URL(request.url);
    const login = await beginAdministratorLogin(request, { returnTo: url.searchParams.get('returnTo') || '/admin/' });
    await appendAdminAuditEvent({
      request,
      requestId: id,
      context: null,
      action: 'session.login_start',
      resourceType: 'administrator_session',
      result: 'success'
    });
    return new Response(null, {
      status: 302,
      headers: {
        location: login.destination.href,
        'set-cookie': login.setCookie,
        'cache-control': 'no-store',
        'x-request-id': id
      }
    });
  } catch (error) {
    console.error('admin-login', { requestId: id, message: error.message });
    const failure = genericAuthenticationError(error);
    await appendAdminAuditEvent({
      request,
      requestId: id,
      context: null,
      action: 'session.login_start',
      resourceType: 'administrator_session',
      result: 'failure',
      reason: failure.message
    }).catch(() => null);
    return json({ error: failure.message, requestId: id }, failure.status, {
      'cache-control': 'no-store',
      ...(error?.retryAfter ? { 'retry-after': String(error.retryAfter) } : {})
    });
  }
};
