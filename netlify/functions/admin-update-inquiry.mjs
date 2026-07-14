import { requireAdmin } from './_shared/admin-auth.mjs';
import { saveInquiry } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    if (!payload.inquiry?.id) return json({ error: 'Inquiry ID is required.' }, 400);
    const inquiry = await saveInquiry(payload.inquiry, payload.expectedUpdatedAt || '');
    return json({ inquiry });
  } catch (error) {
    console.error('admin-update-inquiry', error);
    return json({ error: error.message || 'The inquiry could not be updated.' }, error.statusCode || 400);
  }
};
