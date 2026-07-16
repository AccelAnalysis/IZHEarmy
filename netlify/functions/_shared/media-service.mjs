import { getStore } from '@netlify/blobs';
import { SOURCE_MEDIA_LIBRARY } from './source-media-library.mjs';
import { validateMediaMetadata } from './media-rules.mjs';
import { applySourceMediaPolicy } from './site-media-policy.mjs';

const BINARY_STORE = 'izhe-media';
const RECORD_STORE = 'izhe-media-records';

export function mediaUrl(id) {
  return `/.netlify/functions/media?id=${encodeURIComponent(id)}`;
}

async function overlayFor(id) {
  return getStore(RECORD_STORE).get(id, { type: 'json', consistency: 'strong' }).catch(() => null);
}

function staticBase(id) {
  return SOURCE_MEDIA_LIBRARY.find((item) => item.id === id) || null;
}

async function uploadedBase(id) {
  const entry = await getStore(BINARY_STORE).getMetadata(id, { consistency: 'strong' }).catch(() => null);
  if (!entry?.metadata) return null;
  return { id, url: mediaUrl(id), static: false, ...entry.metadata };
}

function mergeMedia(base, overlay) {
  if (base?.static) return applySourceMediaPolicy(base, overlay);
  return { ...base, ...(overlay || {}) };
}

export async function getMediaItem(id) {
  const base = staticBase(id) || await uploadedBase(id);
  if (!base) return null;
  const overlay = await overlayFor(id);
  const merged = mergeMedia(base, overlay);
  return { ...merged, id: base.id, url: base.url, static: Boolean(base.static) };
}

export async function listMedia({ includeArchived = true } = {}) {
  const binary = getStore(BINARY_STORE);
  const result = await binary.list();
  const uploaded = [];
  for (const blob of result.blobs || []) {
    const entry = await binary.getMetadata(blob.key, { consistency: 'strong' }).catch(() => null);
    if (!entry?.metadata) continue;
    uploaded.push({ id: blob.key, url: mediaUrl(blob.key), static: false, ...entry.metadata });
  }
  const combined = [...SOURCE_MEDIA_LIBRARY, ...uploaded];
  const rows = [];
  for (const item of combined) {
    const overlay = await overlayFor(item.id);
    const merged = { ...mergeMedia(item, overlay), id: item.id, url: item.url, static: Boolean(item.static) };
    if (includeArchived || merged.usageStatus !== 'archived') rows.push(merged);
  }
  return rows.sort((a, b) => {
    const statusOrder = { approved: 0, draft: 1, restricted: 2, archived: 3 };
    const status = (statusOrder[a.usageStatus] ?? 9) - (statusOrder[b.usageStatus] ?? 9);
    if (status) return status;
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')) || String(a.title || a.filename || '').localeCompare(String(b.title || b.filename || ''));
  });
}

export async function saveMediaMetadata(id, input) {
  const existing = await getMediaItem(id);
  if (!existing) throw Object.assign(new Error('The selected media asset no longer exists.'), { statusCode: 404 });
  const record = { ...validateMediaMetadata(input, existing), reviewSource: 'manual' };
  await getStore(RECORD_STORE).setJSON(id, record);
  return { ...existing, ...record, id: existing.id, url: existing.url, static: Boolean(existing.static) };
}

export async function createUploadedMediaRecord(id, input) {
  const record = { ...validateMediaMetadata(input), reviewSource: 'upload' };
  await getStore(RECORD_STORE).setJSON(id, record);
  return record;
}
