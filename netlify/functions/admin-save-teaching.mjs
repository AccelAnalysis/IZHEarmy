import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { listCampaigns } from './_shared/campaign-service.mjs';
import { saveTeachingRecord } from './_shared/teaching-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const [{ catalog }, campaigns] = await Promise.all([loadCatalog(), listCampaigns()]);
    const result = await saveTeachingRecord(payload.type, payload.record, payload.expectedRevision, { products: catalog.products, campaigns });
    return json(result);
  } catch (error) {
    console.error('admin-save-teaching', error);
    return json({ error: error.message || 'Teaching content could not be saved.' }, error.statusCode || 400);
  }
};
