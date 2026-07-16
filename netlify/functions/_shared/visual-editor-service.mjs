import { getStore } from '@netlify/blobs';
import { CONTENT_SCHEMAS, loadContentLibrary, saveContentRecords, validateContentRecord } from './content-service.mjs';
import { listMedia } from './media-service.mjs';

const DRAFT_STORE = 'izhe-visual-drafts';
const DRAFT_KEY = 'homepage';

async function safeListMedia() {
  try {
    return { media: await listMedia(), warning: '' };
  } catch (error) {
    console.error('visual-editor media library', error);
    return { media: [], warning: 'The Media Library could not be loaded. Text and layout editing remain available.' };
  }
}

function mergeWorkingRecords(library, draft) {
  const changes = new Map((draft?.changes || []).map((change) => [change.key, change]));
  return library.records.map((record) => {
    const change = changes.get(record.key);
    return change ? { ...record, fields: { ...record.fields, ...change.fields }, visualDraft: true } : record;
  });
}

function cleanChanges(changes, library) {
  if (!Array.isArray(changes) || !changes.length) throw Object.assign(new Error('There are no visual changes to save.'), { statusCode: 400 });
  const existingByKey = new Map(library.records.map((record) => [record.key, record]));
  const seen = new Set();
  return changes.map((change) => {
    const existing = existingByKey.get(String(change?.key || ''));
    if (!existing || seen.has(existing.key)) throw Object.assign(new Error('The visual draft contains an invalid or duplicate website section.'), { statusCode: 400 });
    seen.add(existing.key);
    const validated = validateContentRecord({ ...existing, status: 'draft', publishAt: '', unpublishAt: '', fields: { ...existing.fields, ...(change.fields || {}) } }, existing);
    return { key: existing.key, fields: validated.fields };
  });
}

export async function loadVisualEditorData() {
  const [{ library }, draft, mediaResult] = await Promise.all([
    loadContentLibrary(),
    getStore(DRAFT_STORE).get(DRAFT_KEY, { type: 'json', consistency: 'strong' }).catch(() => null),
    safeListMedia()
  ]);
  const safeDraft = draft && Number(draft.baseRevision) === library.revision ? draft : draft ? { ...draft, stale: true } : null;
  const records = mergeWorkingRecords(library, safeDraft?.stale ? null : safeDraft);
  return {
    libraryRevision: library.revision,
    libraryUpdatedAt: library.updatedAt,
    records,
    schemas: CONTENT_SCHEMAS,
    media: mediaResult.media,
    warnings: mediaResult.warning ? [mediaResult.warning] : [],
    draft: safeDraft,
    draftChanges: safeDraft?.stale ? [] : safeDraft?.changes || []
  };
}

export async function saveVisualDraft({ baseRevision, changes }) {
  const { library } = await loadContentLibrary();
  if (Number(baseRevision) !== library.revision) throw Object.assign(new Error('Website content changed after this editor was opened. Reload before saving the visual draft.'), { statusCode: 409 });
  const clean = cleanChanges(changes, library);
  const store = getStore(DRAFT_STORE);
  const previous = await store.get(DRAFT_KEY, { type: 'json', consistency: 'strong' }).catch(() => null);
  const draft = {
    id: DRAFT_KEY,
    baseRevision: library.revision,
    revision: Number(previous?.revision || 0) + 1,
    changes: clean,
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await store.setJSON(DRAFT_KEY, draft);
  return draft;
}

export async function publishVisualDraft({ baseRevision, changes } = {}) {
  const store = getStore(DRAFT_STORE);
  const savedDraft = await store.get(DRAFT_KEY, { type: 'json', consistency: 'strong' }).catch(() => null);
  const { library } = await loadContentLibrary();
  const effectiveChanges = Array.isArray(changes) && changes.length ? cleanChanges(changes, library) : savedDraft?.changes || [];
  const expected = Number(baseRevision ?? savedDraft?.baseRevision);
  if (!effectiveChanges.length) throw Object.assign(new Error('There is no visual draft to publish.'), { statusCode: 400 });
  if (expected !== library.revision) throw Object.assign(new Error('Website content changed after this draft was created. Reload and review the draft before publishing.'), { statusCode: 409 });
  const current = new Map(library.records.map((record) => [record.key, record]));
  const inputs = effectiveChanges.map((change) => {
    const existing = current.get(change.key);
    return { ...existing, status: 'published', publishAt: '', unpublishAt: '', fields: { ...existing.fields, ...change.fields } };
  });
  const result = await saveContentRecords(inputs, library.revision);
  await store.delete(DRAFT_KEY).catch(() => {});
  return result;
}

export async function discardVisualDraft() {
  await getStore(DRAFT_STORE).delete(DRAFT_KEY).catch(() => {});
  return { discarded: true };
}
