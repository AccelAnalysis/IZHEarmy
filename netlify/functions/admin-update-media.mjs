import { requireAdmin } from './_shared/admin-auth.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';
import { saveMediaMetadata } from './_shared/media-service.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const id = String(payload?.id || '').trim();
    if (!id) return json({ error: 'Select a media asset to update.' }, 400);
    const media = await saveMediaMetadata(id, payload.metadata || {});
    return json({ media });
  } catch (error) {
    console.error('admin-update-media', error);
    return json({ error: error.message || 'The media record could not be updated.' }, error.statusCode || 400);
  }
};
