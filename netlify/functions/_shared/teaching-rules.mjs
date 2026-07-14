export const TEACHING_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'hidden', 'archived'];
export const RESOURCE_ACCESS = ['public', 'campaign_participants', 'church_leaders', 'presenters', 'admin_only'];
export const RESOURCE_TYPES = ['book_excerpt', 'teaching_outline', 'discussion_guide', 'youth_guide', 'presentation', 'speaker_notes', 'handout', 'video', 'audio', 'image', 'other'];

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const cleanId = (value, max = 100) => clean(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');

export function teachingIsLive(record, now = new Date()) {
  if (!record || !['published', 'scheduled'].includes(record.status)) return false;
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
  const now = new Date().toISOString();
  return {
    id, slug: cleanId(input?.slug || title, 120), title,
    subtitle: clean(input?.subtitle, 260), collectionId: cleanId(input?.collectionId, 100),
    description: clean(input?.description, 4000), author: clean(input?.author, 180),
    coverImage: clean(input?.coverImage, 1200), sampleUrl: clean(input?.sampleUrl, 1200),
    physicalProductId: cleanId(input?.physicalProductId, 100), digitalUrl: clean(input?.digitalUrl, 1200),
    status, publishAt: input?.publishAt ? new Date(input.publishAt).toISOString() : '',
    unpublishAt: input?.unpublishAt ? new Date(input.unpublishAt).toISOString() : '',
    displayOrder: Number.isFinite(Number(input?.displayOrder)) ? Number(input.displayOrder) : 100,
    createdAt: existing?.createdAt || now, updatedAt: now
  };
}

export function validateChapter(input, books, existing = null) {
  const id = existing?.id || cleanId(input?.id || `${input?.bookId}-${input?.chapterNumber}-${input?.title}`);
  const bookId = cleanId(input?.bookId, 100);
  const title = clean(input?.title, 220);
  if (!id || !bookId || !title) throw new Error('Chapter ID, book, and title are required.');
  if (!books.some((book) => book.id === bookId)) throw new Error('Select a valid book.');
  const status = TEACHING_STATUSES.includes(input?.status) ? input.status : existing?.status || 'draft';
  const now = new Date().toISOString();
  return {
    id, bookId, slug: cleanId(input?.slug || title, 120), chapterNumber: Math.max(1, Number(input?.chapterNumber || 1)), title,
    divineName: clean(input?.divineName, 160), izheQuestion: clean(input?.izheQuestion, 180),
    coreScripture: clean(input?.coreScripture, 500), supportingScriptures: clean(input?.supportingScriptures, 1800),
    teachingSummary: clean(input?.teachingSummary, 5000), mainLesson: clean(input?.mainLesson, 8000),
    reflection: clean(input?.reflection, 4000), discussionQuestions: clean(input?.discussionQuestions, 5000),
    prayer: clean(input?.prayer, 4000), practicalApplication: clean(input?.practicalApplication, 4000),
    youthAdaptation: clean(input?.youthAdaptation, 5000), leaderNotes: clean(input?.leaderNotes, 5000),
    relatedProductIds: [...new Set((Array.isArray(input?.relatedProductIds) ? input.relatedProductIds : []).map((value) => cleanId(value, 100)).filter(Boolean))],
    status, publishAt: input?.publishAt ? new Date(input.publishAt).toISOString() : '',
    unpublishAt: input?.unpublishAt ? new Date(input.unpublishAt).toISOString() : '',
    createdAt: existing?.createdAt || now, updatedAt: now
  };
}

export function validateResource(input, books, chapters, existing = null) {
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
  const now = new Date().toISOString();
  return {
    id, slug: cleanId(input?.slug || title, 120), title, type, access,
    bookId, chapterId, collectionId: cleanId(input?.collectionId, 100),
    description: clean(input?.description, 3000), url: clean(input?.url, 1200), thumbnail: clean(input?.thumbnail, 1200),
    campaignIds: [...new Set((Array.isArray(input?.campaignIds) ? input.campaignIds : []).map((value) => clean(value, 100)).filter(Boolean))],
    status, publishAt: input?.publishAt ? new Date(input.publishAt).toISOString() : '',
    unpublishAt: input?.unpublishAt ? new Date(input.unpublishAt).toISOString() : '',
    displayOrder: Number.isFinite(Number(input?.displayOrder)) ? Number(input.displayOrder) : 100,
    createdAt: existing?.createdAt || now, updatedAt: now
  };
}

export function publicTeaching(library, { preview = false, now = new Date() } = {}) {
  const visible = (record) => preview || teachingIsLive(record, now);
  return {
    revision: Number(library?.revision || 1), updatedAt: library?.updatedAt || '', preview,
    books: (library?.books || []).filter(visible).sort((a, b) => a.displayOrder - b.displayOrder),
    chapters: (library?.chapters || []).filter(visible).sort((a, b) => a.chapterNumber - b.chapterNumber),
    resources: (library?.resources || []).filter((record) => visible(record) && (preview || record.access === 'public')).sort((a, b) => a.displayOrder - b.displayOrder)
  };
}
