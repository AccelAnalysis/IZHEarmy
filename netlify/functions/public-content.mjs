import { isAdmin } from './_shared/admin-auth-v2.mjs';
import { loadContentLibrary, publicContent } from './_shared/content-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const previewRequested = new URL(request.url).searchParams.get('preview') === '1';
    const preview = previewRequested && await isAdmin(request, 'content.website.preview');
    const { library } = await loadContentLibrary();
    return json(publicContent(library, { preview }), 200, {
      'cache-control': preview ? 'no-store' : 'public, max-age=30, stale-while-revalidate=120',
      'x-content-type-options': 'nosniff'
    });
  } catch (error) {
    console.error('public-content', { message: error.message });
    return json({ error: 'Website content could not be loaded.' }, 500);
  }
};
