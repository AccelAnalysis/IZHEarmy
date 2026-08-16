import { appendAdminAuditEvent } from './_shared/admin-audit-service.mjs';
import { clearLoginCookie, requestId } from './_shared/admin-crypto.mjs';
import { completeAdministratorLogin, genericAuthenticationError } from './_shared/admin-oidc-service.mjs';
import { methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const id = requestId(request);
  try {
    const completed = await completeAdministratorLogin(request, id);
    const headers = new Headers({
      location: completed.returnTo,
      'cache-control': 'no-store',
      'x-request-id': id
    });
    for (const value of completed.headers['set-cookie'] || []) headers.append('set-cookie', value);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const failure = genericAuthenticationError(error);
    console.error('admin-oidc-callback', { requestId: id, status: failure.status, message: error.message });
    await appendAdminAuditEvent({
      request,
      requestId: id,
      context: null,
      action: 'session.login',
      resourceType: 'administrator_session',
      result: 'failure',
      reason: failure.message
    }).catch(() => null);
    const target = new URL('/admin/', request.url);
    target.searchParams.set(error?.configurationError ? 'configuration' : 'auth', 'error');
    target.searchParams.set('requestId', id);
    const headers = new Headers({
      location: target.pathname + target.search,
      'cache-control': 'no-store',
      'x-request-id': id,
      'set-cookie': clearLoginCookie()
    });
    if (error?.retryAfter) headers.set('retry-after', String(error.retryAfter));
    return new Response(null, { status: 302, headers });
  }
};
