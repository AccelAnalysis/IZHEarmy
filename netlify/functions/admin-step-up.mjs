import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { beginAdministratorLogin } from './_shared/admin-oidc-service.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'overview.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'session.step_up_start',
  rateClass: 'login'
}, async (request, context) => {
  const url = new URL(request.url);
  const login = await beginAdministratorLogin(request, {
    returnTo: url.searchParams.get('returnTo') || '/admin/',
    purpose: 'step-up',
    expectedUserId: context.userId,
    priorSessionId: context.sessionId
  });
  return {
    response: new Response(null, {
      status: 302,
      headers: {
        location: login.destination.href,
        'set-cookie': login.setCookie,
        'cache-control': 'no-store'
      }
    }),
    audit: {
      resourceType: 'administrator_session',
      resourceId: context.sessionId,
      afterSummary: { purpose: 'step-up', started: true }
    }
  };
});
