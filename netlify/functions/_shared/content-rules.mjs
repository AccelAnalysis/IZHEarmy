export const CONTENT_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'hidden', 'archived'];

export const CONTENT_SCHEMAS = {
  'site-seo': { label: 'Site search and sharing', fields: { title: { label: 'Browser title', type: 'text', max: 180 }, description: { label: 'Search description', type: 'textarea', max: 500 }, socialTitle: { label: 'Social sharing title', type: 'text', max: 180 }, socialDescription: { label: 'Social sharing description', type: 'textarea', max: 500 }, socialImage: { label: 'Social sharing image URL', type: 'url', max: 1200 } } },
  'home-hero': { label: 'Home hero', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, question: { label: 'Question', type: 'text', max: 180 }, body: { label: 'Supporting message', type: 'textarea', max: 1200 }, primaryLabel: { label: 'Primary button label', type: 'text', max: 80 }, primaryTarget: { label: 'Primary button target', type: 'link', max: 500 }, secondaryLabel: { label: 'Secondary button label', type: 'text', max: 80 }, secondaryTarget: { label: 'Secondary button target', type: 'link', max: 500 }, backgroundImage: { label: 'Background image URL', type: 'url', max: 1200 } } },
  'home-story': { label: 'Home story', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, heading: { label: 'Heading', type: 'text', max: 220 }, accent: { label: 'Accent line', type: 'text', max: 180 }, paragraph1: { label: 'First paragraph', type: 'textarea', max: 1800 }, paragraph2: { label: 'Second paragraph', type: 'textarea', max: 1800 }, image: { label: 'Story image URL', type: 'url', max: 1200 }, imageAlt: { label: 'Story image description', type: 'text', max: 240 } } },
  'home-book': { label: 'Home book feature', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 140 }, heading: { label: 'Book title', type: 'text', max: 220 }, subtitle: { label: 'Book subtitle', type: 'text', max: 240 }, body: { label: 'Book introduction', type: 'textarea', max: 1800 }, previewLabel: { label: 'Preview button label', type: 'text', max: 100 }, libraryLabel: { label: 'Teaching library button label', type: 'text', max: 100 }, backgroundImage: { label: 'Background image URL', type: 'url', max: 1200 } } },
  'home-give-one': { label: 'Give One section', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, heading: { label: 'Heading', type: 'text', max: 220 }, body: { label: 'Explanation', type: 'textarea', max: 2200 } } },
  'home-church': { label: 'Churches and ministries section', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, heading: { label: 'Heading', type: 'text', max: 220 }, body: { label: 'Invitation', type: 'textarea', max: 2200 }, backgroundImage: { label: 'Background image URL', type: 'url', max: 1200 }, submitLabel: { label: 'Form button label', type: 'text', max: 100 } } },
  'site-announcement': { label: 'Site announcement', fields: { message: { label: 'Announcement', type: 'textarea', max: 500 }, linkLabel: { label: 'Link label', type: 'text', max: 80 }, linkUrl: { label: 'Link URL', type: 'link', max: 500 } } }
};

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function cleanUrl(value, max = 1200, allowHash = false) {
  const url = clean(value, max);
  if (!url) return '';
  if (url.startsWith('/') || (allowHash && url.startsWith('#'))) return url;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error();
    return url;
  } catch {
    throw new Error('Content links and images must use HTTPS, HTTP, mailto, a site-relative path, or an approved page anchor.');
  }
}

function normalizedDate(value, label) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Enter a valid ${label}.`);
  return date.toISOString();
}

export function validatePublicationWindow(status, publishAt, unpublishAt) {
  const publish = normalizedDate(publishAt, 'publication date');
  const unpublish = normalizedDate(unpublishAt, 'unpublication date');
  if (status === 'scheduled' && !publish) throw new Error('Scheduled content requires a publication date.');
  if (publish && unpublish && new Date(unpublish) <= new Date(publish)) throw new Error('The unpublication date must be later than the publication date.');
  return { publishAt: publish, unpublishAt: unpublish };
}

export function contentIsLive(record, now = new Date()) {
  if (!record || !['published', 'scheduled'].includes(record.status)) return false;
  if (record.status === 'scheduled' && !record.publishAt) return false;
  const from = record.publishAt ? new Date(record.publishAt) : null;
  const until = record.unpublishAt ? new Date(record.unpublishAt) : null;
  if (from && !Number.isNaN(from.valueOf()) && from > now) return false;
  if (until && !Number.isNaN(until.valueOf()) && until < now) return false;
  return true;
}

export function validateContentRecord(input, existing = null) {
  const key = clean(input?.key || existing?.key, 100).toLowerCase();
  const schema = CONTENT_SCHEMAS[key];
  if (!schema) throw new Error('Select a supported content section.');
  const status = CONTENT_STATUSES.includes(input?.status) ? input.status : existing?.status || 'draft';
  const fields = {};
  for (const [fieldKey, definition] of Object.entries(schema.fields)) {
    const value = input?.fields?.[fieldKey];
    fields[fieldKey] = definition.type === 'url' ? cleanUrl(value, definition.max) : definition.type === 'link' ? cleanUrl(value, definition.max, true) : clean(value, definition.max || 1000);
  }
  if (status === 'published' && !Object.values(fields).some(Boolean)) throw new Error('Published content cannot be empty.');
  const window = validatePublicationWindow(status, input?.publishAt, input?.unpublishAt);
  const now = new Date().toISOString();
  return { key, label: schema.label, status, fields, ...window, revision: Number(existing?.revision || 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now };
}

export function publicContent(library, { preview = false, now = new Date() } = {}) {
  const records = (library?.records || []).filter((record) => preview || contentIsLive(record, now));
  return { revision: Number(library?.revision || 1), updatedAt: library?.updatedAt || '', preview, records: Object.fromEntries(records.map((record) => [record.key, { key: record.key, label: record.label, fields: record.fields, status: record.status, updatedAt: record.updatedAt }])) };
}
