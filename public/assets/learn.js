'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
let teachingData = { books: [], chapters: [], resources: [] };

function renderBook() {
  const book = teachingData.books[0];
  if (!book) { $('#featuredBook').innerHTML = '<p class="text-muted">The featured book is being prepared.</p>'; return; }
  $('#featuredBook').innerHTML = `${book.coverImage ? `<img src="${escapeHtml(book.coverImage)}" alt="${escapeHtml(book.title)} cover" class="w-full h-44 object-cover rounded-2xl mb-5">` : ''}<p class="text-gold text-xs font-bold tracking-[.16em]">FEATURED BOOK</p><h2 class="font-serif text-3xl mt-3">${escapeHtml(book.title)}</h2><p class="text-muted mt-2">${escapeHtml(book.subtitle)}</p><p class="text-sm text-slate-300 mt-4 leading-relaxed">${escapeHtml(book.description)}</p>${book.sampleUrl ? `<a href="${escapeHtml(book.sampleUrl)}" class="inline-block mt-5 text-gold font-bold">READ THE SAMPLE →</a>` : ''}`;
}

function filteredChapters() {
  const query = $('#chapterSearch').value.trim().toLowerCase();
  return teachingData.chapters.filter((chapter) => !query || JSON.stringify(chapter).toLowerCase().includes(query));
}

function renderChapters() {
  const chapters = filteredChapters();
  $('#chapterGrid').innerHTML = chapters.map((chapter) => `<button type="button" data-chapter="${escapeHtml(chapter.id)}" class="chapter-card text-left bg-panel border border-white/10 rounded-2xl p-6"><div class="flex justify-between gap-4"><span class="text-gold text-xs font-extrabold tracking-[.15em]">CHAPTER ${String(chapter.chapterNumber).padStart(2, '0')}</span><span class="text-xs text-muted">${escapeHtml(chapter.coreScripture)}</span></div><h3 class="font-serif text-3xl mt-5">${escapeHtml(chapter.divineName)}</h3><p class="text-gold font-bold mt-2">${escapeHtml(chapter.izheQuestion)}</p><p class="text-muted text-sm leading-relaxed mt-5">${escapeHtml(chapter.teachingSummary)}</p></button>`).join('') || '<p class="col-span-full text-muted">No chapters match this search.</p>';
  $$('[data-chapter]').forEach((button) => button.addEventListener('click', () => openChapter(button.dataset.chapter)));
}

function section(title, value) {
  return value ? `<section><h3>${escapeHtml(title)}</h3><p>${escapeHtml(value).replaceAll('\n', '<br>')}</p></section>` : '';
}

function openChapter(id) {
  const chapter = teachingData.chapters.find((item) => item.id === id);
  if (!chapter) return;
  $('#chapterContent').innerHTML = `<p class="text-gold text-xs font-extrabold tracking-[.18em]">CHAPTER ${String(chapter.chapterNumber).padStart(2, '0')} · ${escapeHtml(chapter.coreScripture)}</p><h2 class="font-serif text-5xl md:text-6xl mt-5">${escapeHtml(chapter.divineName)}</h2><p class="text-gold text-2xl font-bold mt-3">${escapeHtml(chapter.izheQuestion)}</p><div class="prose-copy mt-10">${section('Teaching summary', chapter.teachingSummary)}${section('Main lesson', chapter.mainLesson)}${section('Reflection', chapter.reflection)}${section('Discussion questions', chapter.discussionQuestions)}${section('Prayer', chapter.prayer)}${section('Practical application', chapter.practicalApplication)}${section('Youth adaptation', chapter.youthAdaptation)}</div>`;
  $('#chapterDetail').classList.remove('hidden');
  $('#chapterDetail').scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', `/learn/?chapter=${encodeURIComponent(chapter.slug)}`);
}

function renderResources() {
  $('#resourceGrid').innerHTML = teachingData.resources.map((resource) => `<article class="bg-panel border border-white/10 rounded-2xl overflow-hidden">${resource.thumbnail ? `<img src="${escapeHtml(resource.thumbnail)}" alt="" class="w-full h-44 object-cover">` : ''}<div class="p-6"><p class="text-gold text-xs font-bold tracking-[.14em]">${escapeHtml(resource.type.replaceAll('_', ' ').toUpperCase())}</p><h3 class="font-serif text-2xl mt-3">${escapeHtml(resource.title)}</h3><p class="text-muted text-sm mt-4 leading-relaxed">${escapeHtml(resource.description)}</p>${resource.url ? `<a href="${escapeHtml(resource.url)}" class="inline-block text-gold font-bold mt-5">OPEN RESOURCE →</a>` : '<p class="text-xs text-muted mt-5">Resource coming soon.</p>'}</div></article>`).join('') || '<p class="text-muted">Public resources are being prepared.</p>';
}

async function loadTeaching() {
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const token = preview ? localStorage.getItem('izhe-admin-token') || '' : '';
  const response = await fetch(`/.netlify/functions/public-teaching${preview ? '?preview=1' : ''}`, { headers: preview && token ? { authorization: `Bearer ${token}` } : {} });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The teaching library could not be loaded.');
  teachingData = data;
  renderBook(); renderChapters(); renderResources();
  const chapterSlug = new URLSearchParams(location.search).get('chapter');
  if (chapterSlug) {
    const chapter = data.chapters.find((item) => item.slug === chapterSlug);
    if (chapter) openChapter(chapter.id);
  }
}

$('#chapterSearch').addEventListener('input', renderChapters);
$('#closeChapter').addEventListener('click', () => { $('#chapterDetail').classList.add('hidden'); history.replaceState(null, '', '/learn/'); window.scrollTo({ top: $('#chapterGrid').offsetTop - 100, behavior: 'smooth' }); });
loadTeaching().catch((error) => { $('#chapterGrid').innerHTML = `<p class="col-span-full text-red-300">${escapeHtml(error.message)}</p>`; });
