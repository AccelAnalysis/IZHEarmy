import { getStore } from '@netlify/blobs';
import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { loadTeachingLibrary, publicTeaching } from './_shared/teaching-service.mjs';
import { TEACHING_STATUSES, RESOURCE_ACCESS, RESOURCE_TYPES } from './_shared/teaching-rules.mjs';
import { json } from './_shared/http.mjs';

async function listFiles() {
  const store = getStore('izhe-teaching-files');
  const result = await store.list();
  const files = [];
  for (const blob of result.blobs || []) {
    const metadata = await store.getMetadata(blob.key, { consistency: 'strong' }).catch(() => null);
    if (!metadata?.metadata) continue;
    files.push({ id: blob.key, url: `/.netlify/functions/resource-file?id=${encodeURIComponent(blob.key)}`, ...metadata.metadata });
  }
  return files.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export default adminEndpoint({
  methods: ['GET'],
  permission: 'content.teaching.read',
  csrf: false,
  recentAuth: false,
  auditAction: 'teaching.read',
  rateClass: 'read'
}, async () => {
  const [{ library, etag }, files] = await Promise.all([loadTeachingLibrary(), listFiles()]);
  return json({
    library,
    etag,
    preview: publicTeaching(library, { preview: true }),
    files,
    options: { statuses: TEACHING_STATUSES, access: RESOURCE_ACCESS, resourceTypes: RESOURCE_TYPES }
  });
});
