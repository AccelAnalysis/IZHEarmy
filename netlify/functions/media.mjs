import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/admin-auth-v2.mjs';
import { sanitizeDisplayFilename } from './_shared/admin-upload-security.mjs';
import { getMediaItem } from './_shared/media-service.mjs';
import { mediaMayBePublished } from './_shared/media-rules.mjs';

function contentDisposition(filename) {
  const safe = sanitizeDisplayFilename(filename || 'image').replaceAll('"', '');
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9._-]{8,160}$/i.test(id)) return new Response('Invalid media ID', { status: 400 });

  const [entry, media] = await Promise.all([
    getStore('izhe-media').getWithMetadata(id, { type: 'blob', consistency: 'strong' }).catch(() => null),
    getMediaItem(id)
  ]);
  if (!entry?.data || !media) return new Response('Image not found', { status: 404 });

  const validationAccepted = !entry.metadata?.validationStatus || entry.metadata.validationStatus === 'validated';
  const publiclyEligible = validationAccepted && mediaMayBePublished(media);
  const administratorAllowed = publiclyEligible ? false : await isAdmin(request, 'media.read');
  if (!publiclyEligible && !administratorAllowed) {
    // Do not reveal whether a draft, restricted, archived, or unvalidated asset exists.
    return new Response('Image not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  return new Response(entry.data, {
    headers: {
      'content-type': entry.metadata?.contentType || entry.data.type || 'application/octet-stream',
      'content-disposition': contentDisposition(entry.metadata?.filename || media.filename || id),
      'cache-control': publiclyEligible ? 'public, max-age=31536000, immutable' : 'no-store',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin'
    }
  });
};
