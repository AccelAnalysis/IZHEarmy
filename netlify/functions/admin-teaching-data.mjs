import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadTeachingLibrary, publicTeaching } from './_shared/teaching-service.mjs';
import { TEACHING_STATUSES, RESOURCE_ACCESS, RESOURCE_TYPES } from './_shared/teaching-rules.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { library, etag } = await loadTeachingLibrary();
    return json({ library, etag, preview: publicTeaching(library, { preview: true }), options: { statuses: TEACHING_STATUSES, access: RESOURCE_ACCESS, resourceTypes: RESOURCE_TYPES } }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-teaching-data', error);
    return json({ error: 'Teaching administration data could not be loaded.' }, 500);
  }
};
