import { requireAdmin } from './_shared/admin-auth.mjs';
import { discardVisualDraft, loadVisualEditorData, publishVisualDraft, saveVisualDraft } from './_shared/visual-editor-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    if (request.method === 'GET') return json(await loadVisualEditorData(), 200, { 'cache-control': 'no-store' });
    if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST']);
    const payload = await request.json();
    if (payload.action === 'saveDraft') {
      await saveVisualDraft(payload);
      return json(await loadVisualEditorData());
    }
    if (payload.action === 'publish') {
      await publishVisualDraft(payload);
      return json(await loadVisualEditorData());
    }
    if (payload.action === 'discard') {
      await discardVisualDraft();
      return json(await loadVisualEditorData());
    }
    return json({ error: 'Select a valid visual editor action.' }, 400);
  } catch (error) {
    console.error('admin-visual-editor', error);
    return json({ error: error.message || 'The visual editor request could not be completed.' }, error.statusCode || 400);
  }
};
