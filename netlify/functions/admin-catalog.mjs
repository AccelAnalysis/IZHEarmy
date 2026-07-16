import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';
import { listMedia } from './_shared/media-service.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [{ catalog, etag }, media] = await Promise.all([loadCatalog(), listMedia()]);
    return json({ catalog, preview: publicCatalog(catalog, { includeDrafts: true }), etag, media });
  } catch (error) {
    console.error('admin-catalog', error);
    return json({ error: 'Catalog administration data could not be loaded.' }, 500);
  }
};
