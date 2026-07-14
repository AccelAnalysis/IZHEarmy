import { getStore } from '@netlify/blobs';
import { DEFAULT_TEACHING_LIBRARY } from './teaching-defaults.mjs';
import { publicTeaching, validateBook, validateChapter, validateResource } from './teaching-rules.mjs';

const STORE = 'izhe-teaching';
const KEY = 'library';
const clone = (value) => structuredClone(value);

export { publicTeaching, validateBook, validateChapter, validateResource };

function validateHistory(input) {
  return (Array.isArray(input) ? input : []).slice(-1000).map((entry) => ({
    id: String(entry?.id || `TEACHING-HISTORY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    type: ['book', 'chapter', 'resource'].includes(entry?.type) ? entry.type : '',
    recordId: String(entry?.recordId || entry?.record?.id || '').slice(0, 100),
    savedAt: entry?.savedAt || new Date().toISOString(),
    record: entry?.record ? structuredClone(entry.record) : null
  })).filter((entry) => entry.type && entry.recordId && entry.record);
}

function validateLibrary(input) {
  const books = [];
  for (const raw of input?.books || []) {
    const clean = validateBook(raw, raw.createdAt ? raw : null);
    clean.createdAt = raw.createdAt || clean.createdAt;
    clean.updatedAt = raw.updatedAt || clean.updatedAt;
    books.push(clean);
  }
  const chapters = [];
  for (const raw of input?.chapters || []) {
    const clean = validateChapter(raw, books, raw.createdAt ? raw : null);
    clean.createdAt = raw.createdAt || clean.createdAt;
    clean.updatedAt = raw.updatedAt || clean.updatedAt;
    chapters.push(clean);
  }
  const resources = [];
  for (const raw of input?.resources || []) {
    const clean = validateResource(raw, books, chapters, raw.createdAt ? raw : null);
    clean.createdAt = raw.createdAt || clean.createdAt;
    clean.updatedAt = raw.updatedAt || clean.updatedAt;
    resources.push(clean);
  }
  for (const [label, values] of [['book', books], ['chapter', chapters], ['resource', resources]]) {
    const ids = new Set();
    const slugs = new Set();
    for (const item of values) {
      if (ids.has(item.id)) throw new Error(`Duplicate ${label} ID: ${item.id}`);
      if (slugs.has(item.slug)) throw new Error(`Duplicate ${label} slug: ${item.slug}`);
      ids.add(item.id);
      slugs.add(item.slug);
    }
  }
  return { schemaVersion: 1, revision: Number(input?.revision || 1), updatedAt: input?.updatedAt || new Date().toISOString(), books, chapters, resources, history: validateHistory(input?.history) };
}

export async function loadTeachingLibrary() {
  const store = getStore(STORE);
  const entry = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  if (entry?.data) return { library: validateLibrary(entry.data), etag: entry.etag };
  const seeded = validateLibrary({ ...clone(DEFAULT_TEACHING_LIBRARY), history: [] });
  const created = await store.setJSON(KEY, seeded, { onlyIfNew: true });
  if (created.modified) return { library: seeded, etag: created.etag };
  const raced = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  return { library: validateLibrary(raced?.data || seeded), etag: raced?.etag || null };
}

async function saveLibrary(next, etag) {
  const clean = validateLibrary({ ...next, revision: Number(next.revision || 0) + 1, updatedAt: new Date().toISOString() });
  const result = await getStore(STORE).setJSON(KEY, clean, { onlyIfMatch: etag });
  if (!result.modified) throw Object.assign(new Error('Teaching content changed in another session. Reload before saving.'), { statusCode: 409 });
  return { library: clean, etag: result.etag };
}

function historyEntry(type, record) {
  return { id: `TEACHING-${type}-${record.id}-${Date.now()}`, type, recordId: record.id, savedAt: new Date().toISOString(), record: structuredClone(record) };
}

export async function saveTeachingRecord(type, input, expectedRevision = null, references = {}) {
  const { library, etag } = await loadTeachingLibrary();
  if (expectedRevision != null && Number(expectedRevision) !== library.revision) {
    throw Object.assign(new Error('Teaching content changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  if (type === 'book') {
    const existing = library.books.find((item) => item.id === input?.id) || null;
    const record = validateBook(input, existing);
    const books = existing ? library.books.map((item) => item.id === record.id ? record : item) : [...library.books, record];
    const history = existing ? [...library.history, historyEntry(type, existing)].slice(-1000) : library.history;
    const saved = await saveLibrary({ ...library, books, history }, etag);
    return { ...saved, record };
  }
  if (type === 'chapter') {
    const existing = library.chapters.find((item) => item.id === input?.id) || null;
    const record = validateChapter(input, library.books, existing, references.products || []);
    const chapters = existing ? library.chapters.map((item) => item.id === record.id ? record : item) : [...library.chapters, record];
    const history = existing ? [...library.history, historyEntry(type, existing)].slice(-1000) : library.history;
    const saved = await saveLibrary({ ...library, chapters, history }, etag);
    return { ...saved, record };
  }
  if (type === 'resource') {
    const existing = library.resources.find((item) => item.id === input?.id) || null;
    const record = validateResource(input, library.books, library.chapters, existing, references.campaigns || []);
    const resources = existing ? library.resources.map((item) => item.id === record.id ? record : item) : [...library.resources, record];
    const history = existing ? [...library.history, historyEntry(type, existing)].slice(-1000) : library.history;
    const saved = await saveLibrary({ ...library, resources, history }, etag);
    return { ...saved, record };
  }
  throw new Error('Unsupported teaching record type.');
}
