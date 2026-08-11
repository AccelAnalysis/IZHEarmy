import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { PERMISSIONS, ROLES } from './_shared/admin-permissions.mjs';
import { listAdminUsers, publicAdminUser } from './_shared/admin-user-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'administration.users.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'administrator.list',
  rateClass: 'read'
}, async () => {
  const users = (await listAdminUsers()).map(publicAdminUser);
  const roles = Object.values(ROLES).map((role) => ({
    id: role.id,
    label: role.label,
    description: role.description,
    permissions: [...role.permissions]
  }));
  return json({ users, roles, permissions: [...PERMISSIONS] });
});
