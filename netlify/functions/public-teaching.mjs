import { isAdmin } from './_shared/admin-auth-v2.mjs';
import { loadTeachingLibrary, publicTeaching } from './_shared/teaching-service.mjs';
import { json, methodNotAllowed } from './_shared/http.mjs';

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const url = new URL(request.url);
    const previewRequested = url.searchParams.get('preview') === '1';
    const preview = previewRequested && await isAdmin(request, 'content.teaching.preview');
    const { library } = await loadTeachingLibrary();
    const data = publicTeaching(library, { preview });
    const bookSlug = String(url.searchParams.get('book') || '').trim().toLowerCase();
    const chapterSlug = String(url.searchParams.get('chapter') || '').trim().toLowerCase();
    return json({
      ...data,
      selectedBook: bookSlug ? data.books.find((book) => book.slug === bookSlug) || null : null,
      selectedChapter: chapterSlug ? data.chapters.find((chapter) => chapter.slug === chapterSlug) || null : null
    }, 200, {
      'cache-control': preview ? 'no-store' : 'public, max-age=30, stale-while-revalidate=120',
      'x-content-type-options': 'nosniff'
    });
  } catch (error) {
    console.error('public-teaching', { message: error.message });
    return json({ error: 'The teaching library could not be loaded.' }, 500);
  }
};
