import { getStore } from '@netlify/blobs';
import { validateLedgerEntry } from './accountability-rules.mjs';

const STORE = 'izhe-mission-ledger';

export async function listLedgerEntries(limit = 5000) {
  const store = getStore(STORE);
  const { blobs } = await store.list();
  const entries = [];
  for (const blob of blobs.slice(-limit).reverse()) {
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) entries.push(value);
  }
  return entries.sort((a, b) => new Date(b.effectiveAt || b.createdAt) - new Date(a.effectiveAt || a.createdAt));
}

export async function appendLedgerEntry(input, campaigns) {
  const entry = validateLedgerEntry(input, campaigns);
  const result = await getStore(STORE).setJSON(entry.id, entry, { onlyIfNew: true });
  if (!result.modified) throw Object.assign(new Error('A ledger entry with this ID already exists.'), { statusCode: 409 });
  return entry;
}
