import { loadCatalog, publicCatalog } from './_shared/catalog-service.mjs';
import { isAdmin } from './_shared/admin-auth.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const previewRequested = new URL(request.url).searchParams.get('preview') === '1';
    const includeDrafts = previewRequested && isAdmin(request);
    const { catalog } = await loadCatalog();
    return json(publicCatalog(catalog, { includeDrafts }), 200, {
      'cache-control': includeDrafts ? 'no-store' : 'public, max-age=30, stale-while-revalidate=120'
    });
  } catch (error) {
    console.error('public-catalog', error);
    return json({ error: 'The catalog could not be loaded.' }, 500);
  }
};
