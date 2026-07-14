export const TEACHING_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'hidden', 'archived'];
export const RESOURCE_ACCESS = ['public', 'campaign_participants', 'church_leaders', 'presenters', 'admin_only'];
export const RESOURCE_TYPES = ['book_excerpt', 'teaching_outline', 'discussion_guide', 'youth_guide', 'presentation', 'speaker_notes', 'handout', 'video', 'audio', 'image', 'other'];

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const cleanId = (value, max = 100) => clean(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');
function cleanUrl(value, max = 1200) {
  const url = clean(value, max);
  if (!url) return '';
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return url;
  } catch {
    throw new Error('Teaching resource links must use HTTPS, HTTP, or a site-relative path.');
  }
}
function normalizedDate(value, label) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Enter a valid ${label}.`);
  return date.toISOString();
}
export function validateTeachingPublicationWindow(status, publishAt, unpublishAt) {
  const publish = normalizedDate(publishAt, 'publication date');
  const unpublish = normalizedDate(unpublishAt, 'unpublication date');
  if (status === 'scheduled' && !publish) throw new Error('Scheduled teaching content requires a publication date.');
  if (publish && unpublish && new Date(unpublish) <= new Date(publish)) throw new Error('The unpublication date must be later than the publication date.');
  return { publishAt: publish, unpublishAt: unpublish };
}
export function teachingIsLive(record, now = new Date()) {
  if (!record || !['published', 'scheduled'].includes(record.status)) return false;
  if (record.status === 'scheduled' && !record.publishAt) return false;
  const from = record.publishAt ? new Date(record.publishAt) : null;
  const until = record.unpublishAt ? new Date(record.unpublishAt) : null;
  if (from && !Number.isNaN(from.valueOf()) && from > now) return false;
  if (until && !Number.isNaN(until.valueOf()) && until < now) return false;
  return true;
}
export function validateBook(input, existing = null) {
  const id = existing?.id || cleanId(input?.id || input?.title);
  const title = clean(input?.title, 220);
  if (!id || !title) throw new Error('Book ID and title are required.');
  const status = TEACHING_STATUSES.includes(input?.status) ? input.status : existing?.status || 'draft';
  const window = validateTeachingPublicationWindow(status, input?.publishAt, input?.unpublishAt);
  const now = new Date().toISOString();
  return { id, slug: cleanId(input?.slug || title, 120), title, subtitle: clean(input?.subtitle, 260), collectionId: cleanId(input?.collectionId, 100), description: clean(input?.description, 4000), author: clean(input?.author, 180), coverImage: cleanUrl(input?.coverImage, 1200), sampleUrl: cleanUrl(input?.sampleUrl, 1200), physicalProductId: cleanId(input?.physicalProductId, 100), digitalUrl: cleanUrl(input?.digitalUrl, 1200), status, ...window, displayOrder: Number.isFinite(Number(input?.displayOrder)) ? Number(input.displayOrder) : 100, createdAt: existing?.createdAt || now, updatedAt: now };
}
export function validateChapter(input, books, existing = null, products = []) {
  const id = existing?.id || cleanId(input?.id || `${input?.bookId}-${input?.chapterNumber}-${input?.title}`);
  const bookId = cleanId(input?.bookId, 100);
  const title = clean(input?.title, 220);
  if (!id || !bookId || !title) throw new Error('Chapter ID, book, and title are required.');
  if (!books.some((book) => book.id === bookId)) throw new Error('Select a valid book.');
  const relatedProductIds = [...new Set((Array.isArray(input?.relatedProductIds) ? input.relatedProductIds : []).map((value) => cleanId(value, 100)).filter(Boolean))];
  if (products.length) {
    const known = new Set(products.map((product) => product.id));
    const invalid = relatedProductIds.filter((idValue) => !known.has(idValue));
    if (invalid.length) throw new Error(`Unknown related product: ${invalid[0]}`);
  }
  const status = TEACHING_STATUSES.includes(input?.status) ? input.status : existing?.status || 'draft';
  const window = validateTeachingPublicationWindow(status, input?.publishAt, input?.unpublishAt);
  const now = new Date().toISOString();
  return { id, bookId, slug: cleanId(input?.slug || title, 120), chapterNumber: Math.max(1, Number(input?.chapterNumber || 1)), title, divineName: clean(input?.divineName, 160), izheQuestion: clean(input?.izheQuestion, 180), coreScripture: clean(input?.coreScripture, 500), supportingScriptures: clean(input?.supportingScriptures, 1800), teachingSummary: clean(input?.teachingSummary, 5000), mainLesson: clean(input?.mainLesson, 8000), reflection: clean(input?.reflection, 4000), discussionQuestions: clean(input?.discussionQuestions, 5000), prayer: clean(input?.prayer, 4000), practicalApplication: clean(input?.practicalApplication, 4000), youthAdaptation: clean(input?.youthAdaptation, 5000), leaderNotes: clean(input?.leaderNotes, 5000), relatedProductIds, status, ...window, createdAt: existing?.createdAt || now, updatedAt: now };
}
export function validateResource(input, books, chapters, existing = null, campaigns = []) {
  const id = existing?.id || cleanId(input?.id || input?.title);
  const title = clean(input?.title, 220);
  if (!id || !title) throw new Error('Resource ID and title are required.');
  const status = TEACHING_STATUSES.includes(input?.status) ? input.status : existing?.status || 'draft';
  const access = RESOURCE_ACCESS.includes(input?.access) ? input.access : 'public';
  const type = RESOURCE_TYPES.includes(input?.type) ? input.type : 'other';
  const bookId = cleanId(input?.bookId, 100);
  const chapterId = cleanId(input?.chapterId, 100);
  if (bookId && !books.some((book) => book.id === bookId)) throw new Error('Select a valid book.');
  if (chapterId && !chapters.some((chapter) => chapter.id === chapterId)) throw new Error('Select a valid chapter.');
  const campaignIds = [...new Set((Array.isArray(input?.campaignIds) ? input.campaignIds : []).map((value) => clean(value, 100)).filter(Boolean))];
  if (campaigns.length) {
    const known = new Set(campaigns.map((campaign) => campaign.id));
    const invalid = campaignIds.filter((idValue) => !known.has(idValue));
    if (invalid.length) throw new Error(`Unknown campaign: ${invalid[0]}`);
  }
  const window = validateTeachingPublicationWindow(status, input?.publishAt, input?.unpublishAt);
  const now = new Date().toISOString();
  return { id, slug: cleanId(input?.slug || title, 120), title, type, access, bookId, chapterId, collectionId: cleanId(input?.collectionId, 100), description: clean(input?.description, 3000), url: cleanUrl(input?.url, 1200), thumbnail: cleanUrl(input?.thumbnail, 1200), campaignIds, status, ...window, displayOrder: Number.isFinite(Number(input?.displayOrder)) ? Number(input.displayOrder) : 100, createdAt: existing?.createdAt || now, updatedAt: now };
}
export function publicTeaching(library, { preview = false, now = new Date() } = {}) {
  const visible = (record) => preview || teachingIsLive(record, now);
  return { revision: Number(library?.revision || 1), updatedAt: library?.updatedAt || '', preview, books: (library?.books || []).filter(visible).sort((a, b) => a.displayOrder - b.displayOrder), chapters: (library?.chapters || []).filter(visible).sort((a, b) => a.chapterNumber - b.chapterNumber), resources: (library?.resources || []).filter((record) => visible(record) && (preview || record.access === 'public')).sort((a, b) => a.displayOrder - b.displayOrder) };
}
