import { requireAdmin } from './_shared/admin-auth.mjs';
import { CONTENT_SCHEMAS, loadContentLibrary, publicContent } from './_shared/content-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { library, etag } = await loadContentLibrary();
    return json({ library, etag, schemas: CONTENT_SCHEMAS, preview: publicContent(library, { preview: true }) }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('admin-content-data', error);
    return json({ error: 'Website content administration data could not be loaded.' }, 500);
  }
};
