import { requireAdmin } from './_shared/admin-auth.mjs';
import { loadCatalog } from './_shared/catalog-service.mjs';
import { saveCampaign } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const payload = await request.json();
    const { catalog } = await loadCatalog();
    const campaign = await saveCampaign(payload.campaign || {}, catalog, payload.expectedUpdatedAt || '');
    return json({ campaign }, payload.campaign?.id ? 200 : 201);
  } catch (error) {
    console.error('admin-save-campaign', error);
    return json({ error: error.message || 'The campaign could not be saved.' }, error.statusCode || 400);
  }
};
