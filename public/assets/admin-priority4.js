'use strict';
let priority4Data = { content: null, teaching: null, finance: null };
let activeContentKey = '';
let activeBookId = '';
let activeChapterId = '';
let activeResourceId = '';
const CONTENT_STATUSES_UI = ['draft','in_review','approved','scheduled','published','hidden','archived'];
const TEACHING_STATUSES_UI = ['draft','in_review','approved','scheduled','published','hidden','archived'];

const optionList = (values, selected = '') => values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${humanStatus(value)}</option>`).join('');
const commaList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

async function loadPriority4Data() {
  const [content, teaching, finance] = await Promise.all([
    request('/.netlify/functions/admin-content-data'),
    request('/.netlify/functions/admin-teaching-data'),
    request('/.netlify/functions/admin-finance-data')
  ]);
  priority4Data = { content, teaching, finance };
  renderPriority4();
}

function renderPriority4() {
  renderContentList();
  populateTeachingOptions();
  renderBookList();
  renderChapterList();
  renderResourceList();
  renderFinance();
  if (!activeContentKey) editContent(priority4Data.content.library.records[0]?.key || '');
  if (!activeBookId) newBook(); else editBook(activeBookId);
  if (!activeChapterId) newChapter(); else editChapter(activeChapterId);
  if (!activeResourceId) newResource(); else editResource(activeResourceId);
}

function renderContentList() {
  const records = priority4Data.content?.library?.records || [];
  $('#websiteContentList').innerHTML = records.map((record) => `<button type="button" data-content-key="${escapeHtml(record.key)}" class="w-full text-left p-5 hover:bg-white/5 ${record.key === activeContentKey ? 'bg-white/5' : ''}"><div class="flex justify-between gap-4"><div><strong>${escapeHtml(record.label)}</strong><p class="text-xs text-slate-500 mt-1">${escapeHtml(record.key)}</p><p class="text-xs text-slate-400 mt-2">Revision ${record.revision} · ${formatDate(record.updatedAt)}</p></div>${campaignPill(record.status)}</div></button>`).join('');
  $$('[data-content-key]').forEach((button) => button.addEventListener('click', () => editContent(button.dataset.contentKey)));
}

function editContent(key) {
  const record = priority4Data.content.library.records.find((item) => item.key === key);
  const schema = priority4Data.content.schemas[key];
  if (!record || !schema) return;
  activeContentKey = key;
  $('#websiteContentKey').value = key;
  $('#websiteContentTitle').textContent = schema.label;
  $('#websiteContentStatus').innerHTML = optionList(CONTENT_STATUSES_UI, record.status);
  $('#websiteContentPublishAt').value = toLocalInput(record.publishAt);
  $('#websiteContentUnpublishAt').value = toLocalInput(record.unpublishAt);
  $('#websiteContentFields').innerHTML = Object.entries(schema.fields).map(([fieldKey, definition]) => `<label class="${definition.type === 'textarea' ? 'md:col-span-2' : ''}"><span class="label">${escapeHtml(definition.label.toUpperCase())}</span>${definition.type === 'textarea' ? `<textarea data-content-field="${fieldKey}" class="field" rows="4">${escapeHtml(record.fields[fieldKey] || '')}</textarea>` : `<input data-content-field="${fieldKey}" type="${definition.type === 'url' ? 'url' : 'text'}" class="field" value="${escapeHtml(record.fields[fieldKey] || '')}">`}</label>`).join('');
  $('#websiteContentMessage').textContent = '';
  renderContentList();
}

$('#websiteContentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = $('#websiteContentKey').value;
  const fields = Object.fromEntries($$('[data-content-field]').map((input) => [input.dataset.contentField, input.value]));
  try {
    const result = await request('/.netlify/functions/admin-save-content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: priority4Data.content.library.revision, record: { key, status: $('#websiteContentStatus').value, publishAt: toIso($('#websiteContentPublishAt').value), unpublishAt: toIso($('#websiteContentUnpublishAt').value), fields } }) });
    priority4Data.content.library = result.library;
    activeContentKey = result.record.key;
    editContent(activeContentKey);
    setMessage($('#websiteContentMessage'), 'Website content saved. Published content is now available to the live site.', true);
  } catch (error) { setMessage($('#websiteContentMessage'), error.message); }
});
$('#previewWebsiteContent').addEventListener('click', () => window.open('/?contentPreview=1', '_blank', 'noopener'));

function populateTeachingOptions() {
  const library = priority4Data.teaching.library;
  const statuses = priority4Data.teaching.options.statuses || TEACHING_STATUSES_UI;
  ['teachingBookStatus','teachingChapterStatus','teachingResourceStatus'].forEach((id) => { if ($(`#${id}`)) $(`#${id}`).innerHTML = optionList(statuses); });
  $('#teachingResourceType').innerHTML = optionList(priority4Data.teaching.options.resourceTypes || []);
  $('#teachingResourceAccess').innerHTML = optionList(priority4Data.teaching.options.access || []);
  const collectionOptions = catalogData.catalog.collections.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.shortTitle)} — ${escapeHtml(item.title)}</option>`).join('');
  $('#teachingBookCollection').innerHTML = collectionOptions;
  $('#teachingBookProduct').innerHTML = `<option value="">None</option>${catalogData.catalog.products.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.shortName)}</option>`).join('')}`;
  const bookOptions = library.books.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('');
  $('#teachingChapterBook').innerHTML = bookOptions;
  $('#teachingResourceBook').innerHTML = `<option value="">None</option>${bookOptions}`;
  $('#teachingResourceChapter').innerHTML = `<option value="">None</option>${library.chapters.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.chapterNumber)}. ${escapeHtml(item.title)}</option>`).join('')}`;
}

function renderBookList() {
  $('#teachingBookList').innerHTML = priority4Data.teaching.library.books.map((book) => `<button type="button" data-edit-book="${escapeHtml(book.id)}" class="w-full text-left p-5 hover:bg-white/5 ${book.id === activeBookId ? 'bg-white/5' : ''}"><div class="flex justify-between gap-3"><div><strong>${escapeHtml(book.title)}</strong><p class="text-sm text-slate-400 mt-1">${escapeHtml(book.subtitle)}</p><p class="text-xs text-slate-500 mt-2">${priority4Data.teaching.library.chapters.filter((chapter) => chapter.bookId === book.id).length} chapters</p></div>${campaignPill(book.status)}</div></button>`).join('');
  $$('[data-edit-book]').forEach((button) => button.addEventListener('click', () => editBook(button.dataset.editBook)));
}

function newBook() {
  activeBookId = '';
  $('#teachingBookForm').reset();
  $('#teachingBookOriginalId').value = '';
  $('#teachingBookId').disabled = false;
  $('#teachingBookTitle').textContent = 'New book';
  $('#teachingBookStatus').innerHTML = optionList(TEACHING_STATUSES_UI, 'draft');
  $('#teachingBookOrder').value = 100;
  $('#teachingBookMessage').textContent = '';
  renderBookList();
}

function editBook(id) {
  const book = priority4Data.teaching.library.books.find((item) => item.id === id); if (!book) return;
  activeBookId = id;
  $('#teachingBookOriginalId').value = id; $('#teachingBookId').value = id; $('#teachingBookId').disabled = true;
  $('#teachingBookSlug').value = book.slug; $('#teachingBookName').value = book.title; $('#teachingBookSubtitle').value = book.subtitle || '';
  $('#teachingBookDescription').value = book.description || ''; $('#teachingBookCollection').value = book.collectionId || '';
  $('#teachingBookProduct').value = book.physicalProductId || ''; $('#teachingBookAuthor').value = book.author || '';
  $('#teachingBookOrder').value = book.displayOrder || 100; $('#teachingBookCover').value = book.coverImage || ''; $('#teachingBookSample').value = book.sampleUrl || '';
  $('#teachingBookStatus').innerHTML = optionList(TEACHING_STATUSES_UI, book.status); $('#teachingBookPublishAt').value = toLocalInput(book.publishAt); $('#teachingBookUnpublishAt').value = toLocalInput(book.unpublishAt);
  $('#teachingBookTitle').textContent = `Edit ${book.title}`; $('#teachingBookMessage').textContent = ''; renderBookList();
}

function collectBook() { return { id: $('#teachingBookId').value, slug: $('#teachingBookSlug').value, title: $('#teachingBookName').value, subtitle: $('#teachingBookSubtitle').value, description: $('#teachingBookDescription').value, collectionId: $('#teachingBookCollection').value, physicalProductId: $('#teachingBookProduct').value, author: $('#teachingBookAuthor').value, displayOrder: Number($('#teachingBookOrder').value || 100), coverImage: $('#teachingBookCover').value, sampleUrl: $('#teachingBookSample').value, status: $('#teachingBookStatus').value, publishAt: toIso($('#teachingBookPublishAt').value), unpublishAt: toIso($('#teachingBookUnpublishAt').value) }; }

$('#teachingBookForm').addEventListener('submit', (event) => saveTeachingForm(event, 'book', collectBook(), '#teachingBookMessage', (record) => { activeBookId = record.id; editBook(record.id); }));
$('#newTeachingBook').addEventListener('click', newBook);

function renderChapterList() {
  const query = ($('#teachingChapterSearch')?.value || '').trim().toLowerCase();
  const chapters = priority4Data.teaching.library.chapters.filter((item) => !query || recordSearchText(item).includes(query));
  $('#teachingChapterList').innerHTML = chapters.map((chapter) => `<button type="button" data-edit-chapter="${escapeHtml(chapter.id)}" class="w-full text-left p-5 hover:bg-white/5 ${chapter.id === activeChapterId ? 'bg-white/5' : ''}"><div class="flex justify-between gap-3"><div><strong>${chapter.chapterNumber}. ${escapeHtml(chapter.divineName || chapter.title)}</strong><p class="text-sm text-amber-300 mt-1">${escapeHtml(chapter.izheQuestion)}</p><p class="text-xs text-slate-500 mt-2">${escapeHtml(chapter.coreScripture)}</p></div>${campaignPill(chapter.status)}</div></button>`).join('');
  $$('[data-edit-chapter]').forEach((button) => button.addEventListener('click', () => editChapter(button.dataset.editChapter)));
}

function newChapter() {
  activeChapterId = ''; $('#teachingChapterForm').reset(); $('#teachingChapterOriginalId').value = ''; $('#teachingChapterId').disabled = false;
  $('#teachingChapterTitle').textContent = 'New chapter'; $('#teachingChapterStatus').innerHTML = optionList(TEACHING_STATUSES_UI, 'draft'); $('#teachingChapterNumber').value = priority4Data.teaching.library.chapters.length + 1; $('#teachingChapterMessage').textContent = ''; renderChapterList();
}

function editChapter(id) {
  const chapter = priority4Data.teaching.library.chapters.find((item) => item.id === id); if (!chapter) return;
  activeChapterId = id; $('#teachingChapterOriginalId').value = id; $('#teachingChapterId').value = id; $('#teachingChapterId').disabled = true; $('#teachingChapterBook').value = chapter.bookId; $('#teachingChapterNumber').value = chapter.chapterNumber; $('#teachingChapterName').value = chapter.title; $('#teachingChapterSlug').value = chapter.slug; $('#teachingChapterDivineName').value = chapter.divineName || ''; $('#teachingChapterQuestion').value = chapter.izheQuestion || ''; $('#teachingChapterScripture').value = chapter.coreScripture || ''; $('#teachingChapterSupporting').value = chapter.supportingScriptures || ''; $('#teachingChapterSummary').value = chapter.teachingSummary || ''; $('#teachingChapterLesson').value = chapter.mainLesson || ''; $('#teachingChapterReflection').value = chapter.reflection || ''; $('#teachingChapterQuestions').value = chapter.discussionQuestions || ''; $('#teachingChapterPrayer').value = chapter.prayer || ''; $('#teachingChapterApplication').value = chapter.practicalApplication || ''; $('#teachingChapterYouth').value = chapter.youthAdaptation || ''; $('#teachingChapterLeader').value = chapter.leaderNotes || ''; $('#teachingChapterProducts').value = (chapter.relatedProductIds || []).join(', '); $('#teachingChapterStatus').innerHTML = optionList(TEACHING_STATUSES_UI, chapter.status); $('#teachingChapterPublishAt').value = toLocalInput(chapter.publishAt); $('#teachingChapterUnpublishAt').value = toLocalInput(chapter.unpublishAt); $('#teachingChapterTitle').textContent = `Edit Chapter ${chapter.chapterNumber}`; $('#teachingChapterMessage').textContent = ''; renderChapterList();
}

function collectChapter() { return { id: $('#teachingChapterId').value, bookId: $('#teachingChapterBook').value, chapterNumber: Number($('#teachingChapterNumber').value || 1), title: $('#teachingChapterName').value, slug: $('#teachingChapterSlug').value, divineName: $('#teachingChapterDivineName').value, izheQuestion: $('#teachingChapterQuestion').value, coreScripture: $('#teachingChapterScripture').value, supportingScriptures: $('#teachingChapterSupporting').value, teachingSummary: $('#teachingChapterSummary').value, mainLesson: $('#teachingChapterLesson').value, reflection: $('#teachingChapterReflection').value, discussionQuestions: $('#teachingChapterQuestions').value, prayer: $('#teachingChapterPrayer').value, practicalApplication: $('#teachingChapterApplication').value, youthAdaptation: $('#teachingChapterYouth').value, leaderNotes: $('#teachingChapterLeader').value, relatedProductIds: commaList($('#teachingChapterProducts').value), status: $('#teachingChapterStatus').value, publishAt: toIso($('#teachingChapterPublishAt').value), unpublishAt: toIso($('#teachingChapterUnpublishAt').value) }; }

$('#teachingChapterForm').addEventListener('submit', (event) => saveTeachingForm(event, 'chapter', collectChapter(), '#teachingChapterMessage', (record) => { activeChapterId = record.id; editChapter(record.id); }));
$('#newTeachingChapter').addEventListener('click', newChapter); $('#teachingChapterSearch').addEventListener('input', renderChapterList);

function renderResourceList() {
  $('#teachingResourceList').innerHTML = priority4Data.teaching.library.resources.map((resource) => `<button type="button" data-edit-resource="${escapeHtml(resource.id)}" class="w-full text-left p-5 hover:bg-white/5 ${resource.id === activeResourceId ? 'bg-white/5' : ''}"><div class="flex justify-between gap-3"><div><strong>${escapeHtml(resource.title)}</strong><p class="text-sm text-slate-400 mt-1">${escapeHtml(humanStatus(resource.type))} · ${escapeHtml(humanStatus(resource.access))}</p></div>${campaignPill(resource.status)}</div></button>`).join('');
  $$('[data-edit-resource]').forEach((button) => button.addEventListener('click', () => editResource(button.dataset.editResource)));
}

function newResource() { activeResourceId = ''; $('#teachingResourceForm').reset(); $('#teachingResourceOriginalId').value = ''; $('#teachingResourceId').disabled = false; $('#teachingResourceTitle').textContent = 'New resource'; $('#teachingResourceStatus').innerHTML = optionList(TEACHING_STATUSES_UI, 'draft'); $('#teachingResourceMessage').textContent = ''; renderResourceList(); }
function editResource(id) { const item = priority4Data.teaching.library.resources.find((resource) => resource.id === id); if (!item) return; activeResourceId = id; $('#teachingResourceOriginalId').value = id; $('#teachingResourceId').value = id; $('#teachingResourceId').disabled = true; $('#teachingResourceSlug').value = item.slug; $('#teachingResourceName').value = item.title; $('#teachingResourceDescription').value = item.description || ''; $('#teachingResourceType').value = item.type; $('#teachingResourceAccess').value = item.access; $('#teachingResourceBook').value = item.bookId || ''; $('#teachingResourceChapter').value = item.chapterId || ''; $('#teachingResourceUrl').value = item.url || ''; $('#teachingResourceThumbnail').value = item.thumbnail || ''; $('#teachingResourceCampaigns').value = (item.campaignIds || []).join(', '); $('#teachingResourceStatus').innerHTML = optionList(TEACHING_STATUSES_UI, item.status); $('#teachingResourcePublishAt').value = toLocalInput(item.publishAt); $('#teachingResourceUnpublishAt').value = toLocalInput(item.unpublishAt); $('#teachingResourceTitle').textContent = `Edit ${item.title}`; $('#teachingResourceMessage').textContent = ''; renderResourceList(); }
function collectResource() { return { id: $('#teachingResourceId').value, slug: $('#teachingResourceSlug').value, title: $('#teachingResourceName').value, description: $('#teachingResourceDescription').value, type: $('#teachingResourceType').value, access: $('#teachingResourceAccess').value, bookId: $('#teachingResourceBook').value, chapterId: $('#teachingResourceChapter').value, url: $('#teachingResourceUrl').value, thumbnail: $('#teachingResourceThumbnail').value, campaignIds: commaList($('#teachingResourceCampaigns').value), status: $('#teachingResourceStatus').value, publishAt: toIso($('#teachingResourcePublishAt').value), unpublishAt: toIso($('#teachingResourceUnpublishAt').value) }; }
$('#teachingResourceForm').addEventListener('submit', (event) => saveTeachingForm(event, 'resource', collectResource(), '#teachingResourceMessage', (record) => { activeResourceId = record.id; editResource(record.id); })); $('#newTeachingResource').addEventListener('click', newResource);

async function saveTeachingForm(event, type, record, messageSelector, afterSave) {
  event.preventDefault();
  try {
    const result = await request('/.netlify/functions/admin-save-teaching', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, expectedRevision: priority4Data.teaching.library.revision, record }) });
    priority4Data.teaching.library = result.library; populateTeachingOptions(); renderBookList(); renderChapterList(); renderResourceList(); afterSave(result.record); setMessage($(messageSelector), `${humanStatus(type)} saved.`, true);
  } catch (error) { setMessage($(messageSelector), error.message); }
}

$$('[data-teaching-view]').forEach((button) => button.addEventListener('click', () => { $$('[data-teaching-view]').forEach((item) => item.classList.toggle('tab-active', item === button)); $$('[data-teaching-panel]').forEach((panel) => { panel.hidden = panel.dataset.teachingPanel !== button.dataset.teachingView; }); }));
$('#previewTeaching').addEventListener('click', () => window.open('/learn/?preview=1', '_blank', 'noopener'));

function renderFinance() {
  const data = priority4Data.finance; const summary = data.summary || {};
  $('#financeRevenue').textContent = money(summary.merchandiseRevenue || 0); $('#financeGross').textContent = money(summary.grossCollected || 0); $('#financeAccrued').textContent = money(summary.supportAccrued || 0); $('#financePaid').textContent = money(summary.supportPaid || 0); $('#financeOutstanding').textContent = money(summary.supportOutstanding || 0); $('#financeGiftObligations').textContent = String((summary.activeGiftObligations || 0) + (summary.pendingGiftFulfillment || 0));
  $('#financeCampaignRows').innerHTML = data.campaigns.map((item) => `<tr class="border-b border-white/5"><td class="p-4"><strong>${escapeHtml(item.title)}</strong><p class="text-slate-400">${escapeHtml(item.organization)}</p></td><td class="p-4">${money(item.merchandiseRevenue)}</td><td class="p-4">${money(item.grossCollected)}</td><td class="p-4">${item.soldUnits}</td><td class="p-4">${money(item.supportCalculated)}</td><td class="p-4">${money(item.supportAdjustments)}</td><td class="p-4 font-bold">${money(item.supportAccrued)}</td><td class="p-4">${money(item.supportPaid)}</td><td class="p-4 font-bold ${item.supportOutstanding > 0 ? 'text-amber-300' : 'text-green-300'}">${money(item.supportOutstanding)}</td><td class="p-4">${money(item.campaignCosts)}</td><td class="p-4">${item.activeGiftObligations} codes</td><td class="p-4">${item.fulfilledGifts} fulfilled<br><span class="text-slate-400">${item.pendingGiftFulfillment} pending</span></td></tr>`).join('') || '<tr><td colspan="12" class="p-8 text-center text-slate-400">No campaign accountability records are available.</td></tr>';
  const campaignOptions = data.campaigns.map((item) => `<option value="${escapeHtml(item.campaignId)}">${escapeHtml(item.organization)} — ${escapeHtml(item.title)}</option>`).join('');
  $('#ledgerCampaign').innerHTML = `<option value="">Organization-wide / general</option>${campaignOptions}`; $('#ledgerType').innerHTML = optionList(data.ledgerTypes || []); if (!$('#ledgerEffectiveAt').value) $('#ledgerEffectiveAt').value = new Date().toISOString().slice(0,10); renderLedger();
}

function renderLedger() {
  const query = ($('#ledgerSearch')?.value || '').trim().toLowerCase(); const campaignMap = new Map(priority4Data.finance.campaigns.map((item) => [item.campaignId, item]));
  const entries = priority4Data.finance.ledger.filter((entry) => !query || recordSearchText(entry).includes(query) || recordSearchText(campaignMap.get(entry.campaignId)).includes(query));
  $('#missionLedgerRows').innerHTML = entries.map((entry) => { const campaign = campaignMap.get(entry.campaignId); return `<tr class="border-b border-white/5"><td class="p-4">${new Date(entry.effectiveAt).toLocaleDateString()}</td><td class="p-4">${escapeHtml(campaign ? campaign.organization : 'General')}</td><td class="p-4">${escapeHtml(humanStatus(entry.type))}</td><td class="p-4 font-bold">${money(entry.amount)}</td><td class="p-4">${escapeHtml(entry.reference || '—')}</td><td class="p-4 font-mono text-xs">${escapeHtml(entry.relatedOrderId || '—')}</td><td class="p-4 max-w-md">${escapeHtml(entry.note || '—')}</td></tr>`; }).join('') || '<tr><td colspan="7" class="p-8 text-center text-slate-400">No ledger entries match this search.</td></tr>';
}

$('#missionLedgerForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await request('/.netlify/functions/admin-save-ledger-entry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: { campaignId: $('#ledgerCampaign').value, type: $('#ledgerType').value, amount: Number($('#ledgerAmount').value || 0), effectiveAt: $('#ledgerEffectiveAt').value ? new Date(`${$('#ledgerEffectiveAt').value}T12:00:00`).toISOString() : '', reference: $('#ledgerReference').value, relatedOrderId: $('#ledgerOrder').value, note: $('#ledgerNote').value } }) }); priority4Data.finance = await request('/.netlify/functions/admin-finance-data'); renderFinance(); event.currentTarget.reset(); $('#ledgerEffectiveAt').value = new Date().toISOString().slice(0,10); setMessage($('#ledgerMessage'), 'Ledger entry recorded.', true); } catch (error) { setMessage($('#ledgerMessage'), error.message); } });
$('#ledgerSearch').addEventListener('input', renderLedger);
async function downloadFinance(type) { const response = await fetch(`/.netlify/functions/admin-finance-export?type=${encodeURIComponent(type)}`, { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) return alert('Financial export could not be generated.'); const blob = await response.blob(); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || `izhe-${type}.csv`; anchor.click(); URL.revokeObjectURL(anchor.href); }
$('#exportCampaignAccountability').addEventListener('click', () => downloadFinance('campaigns'));
$('#exportMissionLedger').addEventListener('click', () => downloadFinance('ledger'));

const priority3LoadAll = loadAll;
loadAll = async function priority4AwareLoadAll() {
  await priority3LoadAll();
  if ($('#dashboard').classList.contains('hidden')) return;
  try { await loadPriority4Data(); } catch (error) { console.error('priority4 load', error); }
};
