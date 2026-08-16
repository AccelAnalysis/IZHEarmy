import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { hasPermission, validRoles } from './_shared/admin-permissions.mjs';
import { readJsonBody, requiredExplanation, text } from './_shared/admin-request.mjs';
import { createInvitation, publicAdminUser } from './_shared/admin-user-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['POST'],
  permission: 'administration.users.manage',
  csrf: true,
  recentAuth: true,
  auditAction: 'administrator.invite',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 100_000
}, async (request, context) => {
  const body = await readJsonBody(request);
  const roles = validRoles(body.roles);
  if (roles.includes('owner') && !hasPermission(context.permissions, 'administration.roles.manage')) {
    throw Object.assign(new Error('Owner invitations require role-management permission.'), { statusCode: 403 });
  }
  const reason = requiredExplanation(body.reason);
  const user = await createInvitation({
    email: body.email,
    displayName: text(body.displayName, 160),
    roles,
    note: reason,
    actor: context
  });
  return {
    response: json({ user: publicAdminUser(user) }, 201),
    audit: {
      resourceType: 'administrator',
      resourceId: user.id,
      reason,
      afterSummary: publicAdminUser(user)
    }
  };
});
