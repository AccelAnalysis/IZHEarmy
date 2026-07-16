export const CONTENT_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'hidden', 'archived'];

const choice = (label, options) => ({ label, type: 'enum', options });
const toggle = (label) => ({ label, type: 'boolean' });
const order = (label) => ({ label, type: 'number', min: 1, max: 20 });

export const CONTENT_SCHEMAS = {
  'site-seo': { label: 'Site search and sharing', fields: { title: { label: 'Browser title', type: 'text', max: 180 }, description: { label: 'Search description', type: 'textarea', max: 500 }, socialTitle: { label: 'Social sharing title', type: 'text', max: 180 }, socialDescription: { label: 'Social sharing description', type: 'textarea', max: 500 }, socialImage: { label: 'Social sharing image URL', type: 'url', max: 1200 } } },
  'home-hero': { label: 'Home hero', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, question: { label: 'Question', type: 'text', max: 180 }, body: { label: 'Supporting message', type: 'textarea', max: 1200 }, primaryLabel: { label: 'Primary button label', type: 'text', max: 80 }, primaryTarget: { label: 'Primary button target', type: 'link', max: 500 }, secondaryLabel: { label: 'Secondary button label', type: 'text', max: 80 }, secondaryTarget: { label: 'Secondary button target', type: 'link', max: 500 }, backgroundImage: { label: 'Background image URL', type: 'url', max: 1200 } } },
  'home-story': { label: 'Home story', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, heading: { label: 'Heading', type: 'text', max: 220 }, accent: { label: 'Accent line', type: 'text', max: 180 }, paragraph1: { label: 'First paragraph', type: 'textarea', max: 1800 }, paragraph2: { label: 'Second paragraph', type: 'textarea', max: 1800 }, image: { label: 'Story image URL', type: 'url', max: 1200 }, imageAlt: { label: 'Story image description', type: 'text', max: 240 }, imageEyebrow: { label: 'Image eyebrow', type: 'text', max: 100 }, imageStatement: { label: 'Image statement', type: 'text', max: 120 }, card1Title: { label: 'First feature title', type: 'text', max: 120 }, card1Body: { label: 'First feature description', type: 'textarea', max: 500 }, card2Title: { label: 'Second feature title', type: 'text', max: 120 }, card2Body: { label: 'Second feature description', type: 'textarea', max: 500 } } },
  'home-book': { label: 'Home book feature', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 140 }, heading: { label: 'Book title', type: 'text', max: 220 }, subtitle: { label: 'Book subtitle', type: 'text', max: 240 }, body: { label: 'Book introduction', type: 'textarea', max: 1800 }, previewLabel: { label: 'Preview button label', type: 'text', max: 100 }, libraryLabel: { label: 'Teaching library button label', type: 'text', max: 100 }, backgroundImage: { label: 'Background image URL', type: 'url', max: 1200 }, readTitle: { label: 'Read feature title', type: 'text', max: 100 }, readBody: { label: 'Read feature text', type: 'text', max: 180 }, reflectTitle: { label: 'Reflect feature title', type: 'text', max: 100 }, reflectBody: { label: 'Reflect feature text', type: 'text', max: 180 }, shareTitle: { label: 'Share feature title', type: 'text', max: 100 }, shareBody: { label: 'Share feature text', type: 'text', max: 180 } } },
  'home-give-one': { label: 'Give One section', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, heading: { label: 'Heading', type: 'text', max: 220 }, body: { label: 'Explanation', type: 'textarea', max: 2200 }, step1Title: { label: 'Step 1 title', type: 'text', max: 100 }, step1Body: { label: 'Step 1 description', type: 'textarea', max: 500 }, step2Title: { label: 'Step 2 title', type: 'text', max: 100 }, step2Body: { label: 'Step 2 description', type: 'textarea', max: 500 }, step3Title: { label: 'Step 3 title', type: 'text', max: 100 }, step3Body: { label: 'Step 3 description', type: 'textarea', max: 500 }, image: { label: 'Purpose image URL', type: 'url', max: 1200 }, imageAlt: { label: 'Purpose image description', type: 'text', max: 240 }, purposeEyebrow: { label: 'Purpose eyebrow', type: 'text', max: 100 }, purposeHeading: { label: 'Purpose heading', type: 'text', max: 180 }, purposeBody: { label: 'Purpose description', type: 'textarea', max: 700 } } },
  'home-church': { label: 'Churches and ministries section', fields: { eyebrow: { label: 'Eyebrow', type: 'text', max: 120 }, heading: { label: 'Heading', type: 'text', max: 220 }, body: { label: 'Invitation', type: 'textarea', max: 2200 }, secondParagraph: { label: 'Support explanation', type: 'textarea', max: 1200 }, backgroundImage: { label: 'Background image URL', type: 'url', max: 1200 }, pillar1: { label: 'First pillar', type: 'text', max: 60 }, pillar2: { label: 'Second pillar', type: 'text', max: 60 }, pillar3: { label: 'Third pillar', type: 'text', max: 60 }, pillar4: { label: 'Fourth pillar', type: 'text', max: 60 }, formTitle: { label: 'Form title', type: 'text', max: 160 }, formIntro: { label: 'Form introduction', type: 'textarea', max: 500 }, submitLabel: { label: 'Form button label', type: 'text', max: 100 } } },
  'site-layout': { label: 'Homepage layout', fields: {
    heroVisible: toggle('Show hero'), heroAlignment: choice('Hero alignment', ['left', 'center', 'right']), heroHeight: choice('Hero height', ['compact', 'standard', 'tall']), heroOverlay: choice('Hero overlay', ['light', 'medium', 'strong']), heroFocalPoint: choice('Hero image focal point', ['left', 'center', 'right']),
    storyVisible: toggle('Show story'), storyOrder: order('Story order'), storyAlignment: choice('Story text alignment', ['left', 'center']), storyImagePosition: choice('Story image position', ['left', 'right']), storySpacing: choice('Story spacing', ['compact', 'standard', 'generous']),
    bookVisible: toggle('Show book'), bookOrder: order('Book order'), bookAlignment: choice('Book card alignment', ['left', 'center', 'right']), bookOverlay: choice('Book overlay', ['light', 'medium', 'strong']), bookSpacing: choice('Book spacing', ['compact', 'standard', 'generous']),
    collectionVisible: toggle('Show collection'), collectionOrder: order('Collection order'), collectionSpacing: choice('Collection spacing', ['compact', 'standard', 'generous']),
    giveOneVisible: toggle('Show Give One'), giveOneOrder: order('Give One order'), giveOneAlignment: choice('Give One heading alignment', ['left', 'center']), giveOneImagePosition: choice('Give One image position', ['left', 'right']), giveOneSpacing: choice('Give One spacing', ['compact', 'standard', 'generous']),
    churchVisible: toggle('Show churches section'), churchOrder: order('Churches order'), churchAlignment: choice('Church content alignment', ['left', 'center']), churchOverlay: choice('Church overlay', ['light', 'medium', 'strong']), churchSpacing: choice('Church spacing', ['compact', 'standard', 'generous'])
  } },
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

function cleanField(value, definition) {
  if (definition.type === 'url') return cleanUrl(value, definition.max);
  if (definition.type === 'link') return cleanUrl(value, definition.max, true);
  if (definition.type === 'boolean') return value === true || String(value).toLowerCase() === 'true';
  if (definition.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${definition.label} must be a number.`);
    if (definition.min != null && number < definition.min) throw new Error(`${definition.label} must be at least ${definition.min}.`);
    if (definition.max != null && number > definition.max) throw new Error(`${definition.label} must be no more than ${definition.max}.`);
    return Math.round(number);
  }
  if (definition.type === 'enum') {
    const selected = clean(value, 80);
    if (!definition.options.includes(selected)) throw new Error(`Select a valid ${definition.label.toLowerCase()}.`);
    return selected;
  }
  return clean(value, definition.max || 1000);
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
    fields[fieldKey] = cleanField(value, definition);
  }
  if (status === 'published' && !Object.values(fields).some((value) => value !== '' && value !== null && value !== false)) throw new Error('Published content cannot be empty.');
  const window = validatePublicationWindow(status, input?.publishAt, input?.unpublishAt);
  const now = new Date().toISOString();
  return { key, label: schema.label, status, fields, ...window, revision: Number(existing?.revision || 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now };
}

export function publicContent(library, { preview = false, now = new Date() } = {}) {
  const records = (library?.records || []).filter((record) => preview || contentIsLive(record, now));
  return { revision: Number(library?.revision || 1), updatedAt: library?.updatedAt || '', preview, records: Object.fromEntries(records.map((record) => [record.key, { key: record.key, label: record.label, fields: record.fields, status: record.status, updatedAt: record.updatedAt }])) };
}
