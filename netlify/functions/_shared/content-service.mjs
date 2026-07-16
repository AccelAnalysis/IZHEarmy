import { getStore } from '@netlify/blobs';
import { DEFAULT_CONTENT_LIBRARY } from './content-defaults.mjs';
import { CONTENT_SCHEMAS, publicContent, validateContentRecord } from './content-rules.mjs';

const STORE = 'izhe-content';
const KEY = 'library';
const clone = (value) => structuredClone(value);

export { CONTENT_SCHEMAS, publicContent, validateContentRecord };

function validateHistory(input) {
  return (Array.isArray(input) ? input : []).slice(-500).map((entry) => ({
    id: String(entry?.id || `CONTENT-HISTORY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    recordKey: String(entry?.recordKey || entry?.record?.key || '').slice(0, 100),
    savedAt: entry?.savedAt || new Date().toISOString(),
    record: entry?.record ? structuredClone(entry.record) : null
  })).filter((entry) => entry.recordKey && entry.record);
}

function hasMeaningfulValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value ?? '').trim() !== '';
}

export function normalizeLegacyContentRecord(raw, fallback = null) {
  const merged = fallback ? { ...fallback, ...raw, fields: { ...fallback.fields, ...(raw?.fields || {}) } } : raw;
  if (!merged) return null;
  const fields = merged.fields || {};
  if (merged.key === 'site-announcement' && merged.status === 'published' && !Object.values(fields).some(hasMeaningfulValue)) {
    return { ...merged, status: 'hidden' };
  }
  return merged;
}

function validateLibrary(input) {
  const incoming = new Map((input?.records || []).map((record) => [record.key, record]));
  const defaults = new Map(DEFAULT_CONTENT_LIBRARY.records.map((record) => [record.key, record]));
  const keys = [...new Set([...defaults.keys(), ...incoming.keys()])];
  const records = [];
  for (const key of keys) {
    const fallback = defaults.get(key) || null;
    const raw = incoming.get(key) || fallback;
    if (!raw) continue;
    const merged = normalizeLegacyContentRecord(raw, fallback);
    const existing = merged.createdAt ? { ...merged, revision: Number(merged.revision || 1) - 1 } : null;
    const clean = validateContentRecord(merged, existing);
    clean.revision = Number(merged.revision || clean.revision || 1);
    clean.createdAt = merged.createdAt || clean.createdAt;
    clean.updatedAt = merged.updatedAt || clean.updatedAt;
    records.push(clean);
  }
  return { schemaVersion: 2, revision: Number(input?.revision || 1), updatedAt: input?.updatedAt || new Date().toISOString(), records, history: validateHistory(input?.history) };
}

export async function loadContentLibrary() {
  const store = getStore(STORE);
  const entry = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  if (entry?.data) return { library: validateLibrary(entry.data), etag: entry.etag };
  const seeded = validateLibrary({ ...clone(DEFAULT_CONTENT_LIBRARY), history: [] });
  const created = await store.setJSON(KEY, seeded, { onlyIfNew: true });
  if (created.modified) return { library: seeded, etag: created.etag };
  const raced = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  return { library: validateLibrary(raced?.data || seeded), etag: raced?.etag || null };
}

export async function saveContentRecords(inputs, expectedRevision = null) {
  const { library, etag } = await loadContentLibrary();
  if (expectedRevision != null && Number(expectedRevision) !== library.revision) {
    throw Object.assign(new Error('Website content changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  if (!Array.isArray(inputs) || !inputs.length) throw Object.assign(new Error('Select at least one content record to save.'), { statusCode: 400 });
  const updates = new Map();
  const history = [...library.history];
  for (const input of inputs) {
    const existing = library.records.find((record) => record.key === input?.key) || null;
    const record = validateContentRecord(input, existing);
    if (updates.has(record.key)) throw Object.assign(new Error(`Duplicate content update: ${record.key}`), { statusCode: 400 });
    if (existing) history.push({ id: `CONTENT-${record.key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, recordKey: record.key, savedAt: new Date().toISOString(), record: structuredClone(existing) });
    updates.set(record.key, record);
  }
  const records = library.records.map((item) => updates.get(item.key) || item);
  for (const [key, record] of updates) if (!library.records.some((item) => item.key === key)) records.push(record);
  const next = { ...library, schemaVersion: 2, revision: library.revision + 1, updatedAt: new Date().toISOString(), records, history: history.slice(-500) };
  const result = await getStore(STORE).setJSON(KEY, next, { onlyIfMatch: etag });
  if (!result.modified) throw Object.assign(new Error('Website content changed in another session. Reload before saving.'), { statusCode: 409 });
  return { library: next, records: [...updates.values()], etag: result.etag };
}

export async function saveContentRecord(input, expectedRevision = null) {
  const result = await saveContentRecords([input], expectedRevision);
  return { library: result.library, record: result.records[0], etag: result.etag };
}
