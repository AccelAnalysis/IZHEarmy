import { getStore } from '@netlify/blobs';
import { validateCampaign, validateInquiry } from './campaign-rules.mjs';

export async function listStoreJSON(storeName, limit = 3000) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const selected = blobs.slice(-limit).reverse();
  const rows = [];
  for (const blob of selected) {
    if (blob.key.startsWith('lock-')) continue;
    const value = await store.get(blob.key, { type: 'json', consistency: 'strong' });
    if (value) rows.push(value);
  }
  return rows;
}

export async function listCampaigns() {
  return listStoreJSON('izhe-campaigns');
}

export async function listInquiries() {
  return listStoreJSON('izhe-church-inquiries');
}

export async function findCampaignBySlug(slug) {
  const cleanSlug = String(slug || '').trim().toLowerCase();
  const campaigns = await listCampaigns();
  return campaigns.find((campaign) => campaign.slug === cleanSlug) || null;
}

export async function findCampaignById(id) {
  if (!id) return null;
  return getStore('izhe-campaigns').get(String(id), { type: 'json', consistency: 'strong' });
}

export async function saveCampaign(input, catalog, expectedUpdatedAt = '') {
  const store = getStore('izhe-campaigns');
  const requestedId = String(input?.id || '').trim();
  const existingEntry = requestedId
    ? await store.getWithMetadata(requestedId, { type: 'json', consistency: 'strong' })
    : null;
  if (expectedUpdatedAt && existingEntry?.data?.updatedAt !== expectedUpdatedAt) {
    throw Object.assign(new Error('This campaign changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  const existing = existingEntry?.data || null;
  const campaign = validateCampaign(input, catalog, existing);
  const campaigns = await listCampaigns();
  if (campaigns.some((item) => item.id !== campaign.id && item.slug === campaign.slug)) {
    throw Object.assign(new Error('Another campaign already uses this URL slug.'), { statusCode: 409 });
  }
  const result = existingEntry
    ? await store.setJSON(campaign.id, campaign, { onlyIfMatch: existingEntry.etag })
    : await store.setJSON(campaign.id, campaign, { onlyIfNew: true });
  if (!result.modified) throw Object.assign(new Error('The campaign could not be saved because it changed in another session.'), { statusCode: 409 });
  if (campaign.inquiryId) {
    const inquiryStore = getStore('izhe-church-inquiries');
    const inquiryEntry = await inquiryStore.getWithMetadata(campaign.inquiryId, { type: 'json', consistency: 'strong' });
    if (inquiryEntry) {
      const inquiry = validateInquiry({
        ...inquiryEntry.data,
        status: 'converted',
        linkedCampaignId: campaign.id
      }, inquiryEntry.data);
      await inquiryStore.setJSON(inquiry.id, inquiry, { onlyIfMatch: inquiryEntry.etag }).catch(() => {});
    }
  }
  return campaign;
}

export async function saveInquiry(input, expectedUpdatedAt = '') {
  const store = getStore('izhe-church-inquiries');
  const requestedId = String(input?.id || '').trim();
  const existingEntry = requestedId
    ? await store.getWithMetadata(requestedId, { type: 'json', consistency: 'strong' })
    : null;
  if (expectedUpdatedAt && existingEntry?.data?.updatedAt !== expectedUpdatedAt) {
    throw Object.assign(new Error('This inquiry changed in another session. Reload before saving.'), { statusCode: 409 });
  }
  const inquiry = validateInquiry(input, existingEntry?.data || null);
  const result = existingEntry
    ? await store.setJSON(inquiry.id, inquiry, { onlyIfMatch: existingEntry.etag })
    : await store.setJSON(inquiry.id, inquiry, { onlyIfNew: true });
  if (!result.modified) throw Object.assign(new Error('The inquiry could not be saved because it changed in another session.'), { statusCode: 409 });
  return inquiry;
}
