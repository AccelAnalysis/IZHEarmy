import { requireAdmin } from './_shared/admin-auth.mjs';
import { appendLedgerEntry } from './_shared/accountability-service.mjs';
import { listCampaigns } from './_shared/campaign-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [payload, campaigns] = await Promise.all([request.json(), listCampaigns()]);
    const entry = await appendLedgerEntry(payload.entry, campaigns);
    return json({ entry }, 201);
  } catch (error) {
    console.error('admin-save-ledger-entry', error);
    return json({ error: error.message || 'The ledger entry could not be recorded.' }, error.statusCode || 400);
  }
};
