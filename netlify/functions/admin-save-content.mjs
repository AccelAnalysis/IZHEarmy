import { requireAdmin } from './_shared/admin-auth.mjs';
import { saveContentRecord } from './_shared/content-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const result = await saveContentRecord(payload.record, payload.expectedRevision);
    return json(result);
  } catch (error) {
    console.error('admin-save-content', error);
    return json({ error: error.message || 'Website content could not be saved.' }, error.statusCode || 400);
  }
};
