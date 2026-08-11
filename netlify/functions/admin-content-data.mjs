import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { CONTENT_SCHEMAS, loadContentLibrary, publicContent } from './_shared/content-service.mjs';
import { json } from './_shared/http.mjs';

export default adminEndpoint({
  methods: ['GET'],
  permission: 'content.website.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'website_content.read',
  rateClass: 'read'
}, async () => {
  const { library, etag } = await loadContentLibrary();
  return json({ library, etag, schemas: CONTENT_SCHEMAS, preview: publicContent(library, { preview: true }) });
});
