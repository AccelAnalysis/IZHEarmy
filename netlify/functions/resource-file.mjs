import { getStore } from '@netlify/blobs';
import { getAdminContext, isAdmin } from './_shared/admin-auth-v2.mjs';
import { appendAdminAuditEvent } from './_shared/admin-audit-service.mjs';
import { sanitizeDisplayFilename } from './_shared/admin-upload-security.mjs';
import { requestId } from './_shared/admin-crypto.mjs';
import { loadTeachingLibrary } from './_shared/teaching-service.mjs';
import { teachingIsLive } from './_shared/teaching-rules.mjs';

function disposition(filename, inline) {
  const safe = sanitizeDisplayFilename(filename || 'resource').replaceAll('"', '');
  return `${inline ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9._-]{8,180}$/i.test(id)) return new Response('Invalid file ID', { status: 400 });
  const entry = await getStore('izhe-teaching-files').getWithMetadata(id, { type: 'blob', consistency: 'strong' }).catch(() => null);
  if (!entry?.data) return new Response('File not found', { status: 404 });
  if (entry.metadata?.validationStatus && entry.metadata.validationStatus !== 'validated') {
    return new Response('File not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  const { library } = await loadTeachingLibrary();
  const expectedUrl = `/.netlify/functions/resource-file?id=${encodeURIComponent(id)}`;
  const resource = library.resources.find((item) => item.url === expectedUrl || item.url.endsWith(`id=${encodeURIComponent(id)}`));
  const publiclyAccessible = Boolean(resource && resource.access === 'public' && teachingIsLive(resource));
  let administratorContext = null;
  if (!publiclyAccessible) {
    const administratorAllowed = await isAdmin(request, 'content.teaching.preview');
    if (!administratorAllowed) return new Response('File not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    administratorContext = getAdminContext(request);
  }

  const contentType = entry.metadata?.contentType || entry.data.type || 'application/octet-stream';
  const inline = contentType.startsWith('image/')
    || contentType.startsWith('audio/')
    || contentType.startsWith('video/')
    || contentType === 'application/pdf';
  if (administratorContext) {
    const idForRequest = requestId(request);
    await appendAdminAuditEvent({
      request,
      requestId: idForRequest,
      context: administratorContext,
      action: 'teaching_file.reveal',
      resourceType: 'teaching_file',
      resourceId: id,
      result: 'success',
      afterSummary: {
        resourceId: resource?.id || entry.metadata?.resourceId || null,
        contentType,
        administratorOnly: true
      }
    }).catch((error) => console.error('teaching-file-audit', { requestId: idForRequest, message: error.message }));
  }

  return new Response(entry.data, {
    headers: {
      'content-type': contentType,
      'content-disposition': disposition(entry.metadata?.filename || id, inline),
      'cache-control': publiclyAccessible ? 'private, max-age=300' : 'no-store',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin'
    }
  });
};
