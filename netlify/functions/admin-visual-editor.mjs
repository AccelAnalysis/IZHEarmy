import { adminEndpoint } from './_shared/admin-auth-v2.mjs';
import { readJsonBody } from './_shared/admin-request.mjs';
import {
  discardVisualDraft,
  loadVisualEditorData,
  publishVisualDraft,
  saveVisualDraft
} from './_shared/visual-editor-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

const readVisualEditor = adminEndpoint({
  methods: ['GET'],
  permission: 'content.website.preview',
  csrf: false,
  recentAuth: false,
  auditAction: 'visual_editor.read',
  rateClass: 'read'
}, async () => json(await loadVisualEditorData()));

const writeVisualDraft = adminEndpoint({
  methods: ['POST'],
  permission: 'content.website.write',
  csrf: true,
  recentAuth: false,
  auditAction: 'visual_editor.draft',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request) => {
  const payload = await readJsonBody(request);
  const before = await loadVisualEditorData();
  if (payload.action === 'saveDraft') {
    await saveVisualDraft(payload);
    const after = await loadVisualEditorData();
    return {
      response: json(after),
      audit: {
        resourceType: 'visual_editor_draft',
        resourceId: payload.pageKey || payload.route || 'site',
        beforeSummary: { draftRevision: before.draft?.revision || before.revision || null },
        afterSummary: { draftRevision: after.draft?.revision || after.revision || null, action: 'saveDraft' }
      }
    };
  }
  if (payload.action === 'discard') {
    await discardVisualDraft();
    const after = await loadVisualEditorData();
    return {
      response: json(after),
      audit: {
        resourceType: 'visual_editor_draft',
        resourceId: payload.pageKey || payload.route || 'site',
        reason: String(payload.reason || '').slice(0, 1_000),
        beforeSummary: { draftPresent: Boolean(before.draft), draftRevision: before.draft?.revision || null },
        afterSummary: { draftPresent: Boolean(after.draft), action: 'discard' }
      }
    };
  }
  throw Object.assign(new Error('Select a valid visual editor draft action.'), { statusCode: 400 });
});

const publishVisualEditor = adminEndpoint({
  methods: ['POST'],
  permission: 'content.website.publish',
  csrf: true,
  recentAuth: false,
  auditAction: 'visual_editor.publish',
  rateClass: 'write',
  contentTypes: ['application/json'],
  maxBodyBytes: 1_000_000
}, async (request) => {
  const payload = await readJsonBody(request);
  if (payload.action !== 'publish') throw Object.assign(new Error('Select a valid visual editor publication action.'), { statusCode: 400 });
  const before = await loadVisualEditorData();
  await publishVisualDraft(payload);
  const after = await loadVisualEditorData();
  return {
    response: json(after),
    audit: {
      resourceType: 'visual_editor_publication',
      resourceId: payload.pageKey || payload.route || 'site',
      reason: String(payload.reason || '').slice(0, 1_000),
      beforeSummary: {
        draftRevision: before.draft?.revision || null,
        publishedRevision: before.published?.revision || before.publication?.revision || null
      },
      afterSummary: {
        draftRevision: after.draft?.revision || null,
        publishedRevision: after.published?.revision || after.publication?.revision || null,
        action: 'publish'
      }
    }
  };
});

export default async (request) => {
  if (request.method === 'GET') return readVisualEditor(request);
  if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST']);
  const action = await request.clone().json().then((payload) => payload?.action).catch(() => '');
  return action === 'publish' ? publishVisualEditor(request) : writeVisualDraft(request);
};
