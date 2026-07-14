'use strict';
const priority4LoadState = { content: null, teaching: null, finance: null };
const PRIORITY4_GROUPS = [
  ['Dashboard', ['overview']],
  ['Content', ['website-content', 'teaching', 'media']],
  ['Commerce', ['collections', 'products', 'orders', 'codes', 'operations']],
  ['Campaigns', ['inquiries', 'campaigns', 'campaign-reports']],
  ['Operations', ['fulfillment', 'batches', 'production-batches', 'alerts']],
  ['Accountability', ['accountability']]
];
function installPriority4CorrectionStyles() {
  if ($('#priority4CorrectionStyles')) return;
  document.head.insertAdjacentHTML('beforeend', `<style id="priority4CorrectionStyles">.admin-nav-group{border:1px solid rgba(255,255,255,.08);background:rgba(15,23,42,.65);border-radius:1rem;padding:.5rem}.admin-nav-label{display:block;padding:.15rem .5rem .4rem;font-size:.62rem;font-weight:800;letter-spacing:.14em;color:rgb(100 116 139)}.admin-nav-buttons{display:flex;gap:.35rem;flex-wrap:wrap}.admin-nav-buttons>[data-tab]{padding:.65rem .8rem;font-size:.72rem}.p4-error{border:1px solid rgba(248,113,113,.35);background:rgba(127,29,29,.18);color:rgb(254 202 202);border-radius:1rem;padding:1rem;margin-bottom:1rem}.p4-loading{border:1px solid rgba(96,165,250,.25);background:rgba(30,64,175,.12);color:rgb(191 219 254);border-radius:1rem;padding:.75rem 1rem;margin-bottom:1rem}.p4-help{font-size:.75rem;color:rgb(148 163 184);margin-top:.35rem}.p4-media-preview{width:5rem;height:4rem;object-fit:cover;border-radius:.65rem;background:rgb(2 6 23);border:1px solid rgba(255,255,255,.1)}.p4-checklist{max-height:16rem;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:.75rem;padding:.65rem;background:rgb(2 6 23)}.p4-history{border-top:1px solid rgba(255,255,255,.1);padding-top:1.25rem}.p4-detail-row[hidden]{display:none}</style>`);
}
function installGroupedNavigation() {
  const nav = document.querySelector('nav[aria-label="Admin sections"]');
  if (!nav || nav.dataset.grouped === '1') return;
  nav.dataset.grouped = '1'; nav.className = 'grid sm:grid-cols-2 xl:grid-cols-6 gap-2 mb-7';
  const buttons = [...nav.querySelectorAll('[data-tab]')]; const assigned = new Set();
  for (const [label, tabs] of PRIORITY4_GROUPS) {
    const matches = tabs.map((tab) => nav.querySelector(`[data-tab="${tab}"]`)).filter(Boolean); if (!matches.length) continue;
    const group = document.createElement('div'); group.className = 'admin-nav-group'; group.innerHTML = `<span class="admin-nav-label">${label.toUpperCase()}</span><div class="admin-nav-buttons"></div>`;
    matches.forEach((button) => { group.querySelector('.admin-nav-buttons').append(button); assigned.add(button); }); nav.append(group);
  }
  const leftovers = buttons.filter((button) => !assigned.has(button));
  if (leftovers.length) { const group = document.createElement('div'); group.className = 'admin-nav-group'; group.innerHTML = '<span class="admin-nav-label">MORE</span><div class="admin-nav-buttons"></div>'; leftovers.forEach((button) => group.querySelector('.admin-nav-buttons').append(button)); nav.append(group); }
}
function installSectionStatus(panelName, label) {
  const panel = $(`[data-tab-panel="${panelName}"]`); if (!panel || $(`#${panelName}LoadState`)) return;
  panel.insertAdjacentHTML('afterbegin', `<div id="${panelName}LoadState" class="hidden" data-label="${escapeHtml(label)}"></div>`);
}
function setSectionState(panelName, state, message = '') {
  priority4LoadState[panelName === 'website-content' ? 'content' : panelName === 'accountability' ? 'finance' : 'teaching'] = state;
  const box = $(`#${panelName}LoadState`); if (!box) return;
  if (state === 'ready') { box.className = 'hidden'; box.innerHTML = ''; return; }
  box.className = state === 'loading' ? 'p4-loading' : 'p4-error';
  box.innerHTML = `${escapeHtml(message || `${box.dataset.label} is loading…`)}${state === 'error' ? `<button type="button" data-retry-p4="${panelName}" class="ml-3 underline font-bold">Retry</button>` : ''}`;
}
async function loadPriority4Domain(name, path, render) {
  const panelName = name === 'content' ? 'website-content' : name === 'finance' ? 'accountability' : 'teaching';
  setSectionState(panelName, 'loading', `Loading ${name === 'finance' ? 'accountability' : name} data…`);
  try { const data = await request(path); priority4Data[name] = data; render(); setSectionState(panelName, 'ready'); return data; }
  catch (error) { setSectionState(panelName, 'error', `${humanStatus(name)} could not be loaded: ${error.message}`); return null; }
}
loadPriority4Data = async function correctedPriority4Loader() {
  await Promise.allSettled([
    loadPriority4Domain('content', '/.netlify/functions/admin-content-data', () => { renderContentList(); editContent(activeContentKey || priority4Data.content.library.records[0]?.key || ''); }),
    loadPriority4Domain('teaching', '/.netlify/functions/admin-teaching-data', () => { populateTeachingOptions(); renderBookList(); renderChapterList(); renderResourceList(); if (activeBookId) editBook(activeBookId); else newBook(); if (activeChapterId) editChapter(activeChapterId); else newChapter(); if (activeResourceId) editResource(activeResourceId); else newResource(); }),
    loadPriority4Domain('finance', '/.netlify/functions/admin-finance-data', () => renderFinance())
  ]);
};
function validWindow(status, publishValue, unpublishValue, messageElement) {
  if (status === 'scheduled' && !publishValue) { setMessage(messageElement, 'Scheduled records require a publication date.'); return false; }
  if (publishValue && unpublishValue && new Date(unpublishValue) <= new Date(publishValue)) { setMessage(messageElement, 'The unpublication date must be later than the publication date.'); return false; }
  return true;
}
function installScheduleGuard(formId, statusId, publishId, unpublishId, messageId) {
  const form = $(`#${formId}`); if (!form || form.dataset.scheduleGuard === '1') return; form.dataset.scheduleGuard = '1';
  form.addEventListener('submit', (event) => { if (!validWindow($(`#${statusId}`).value, $(`#${publishId}`).value, $(`#${unpublishId}`).value, $(`#${messageId}`))) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  $(`#${statusId}`)?.addEventListener('change', () => { $(`#${publishId}`).required = $(`#${statusId}`).value === 'scheduled'; });
}
function installDirtyTracking() {
  ['websiteContentForm','teachingBookForm','teachingChapterForm','teachingResourceForm'].forEach((id) => { const form = $(`#${id}`); if (!form || form.dataset.dirtyTracking === '1') return; form.dataset.dirtyTracking = '1'; form.addEventListener('input', () => { form.dataset.dirty = '1'; }); });
  const original = setMessage; setMessage = function p4SetMessage(element, message, ok = false) { original(element, message, ok); if (ok) element.closest('form')?.removeAttribute('data-dirty'); };
  addEventListener('beforeunload', (event) => { if ($$('form[data-dirty="1"]').length) { event.preventDefault(); event.returnValue = ''; } });
}
function installRetryHandlers() {
  document.addEventListener('click', (event) => { const button = event.target.closest('[data-retry-p4]'); if (!button) return; const panel = button.dataset.retryP4;
    if (panel === 'website-content') loadPriority4Domain('content', '/.netlify/functions/admin-content-data', () => { renderContentList(); editContent(activeContentKey || priority4Data.content.library.records[0]?.key || ''); });
    if (panel === 'teaching') loadPriority4Domain('teaching', '/.netlify/functions/admin-teaching-data', () => { populateTeachingOptions(); renderBookList(); renderChapterList(); renderResourceList(); });
    if (panel === 'accountability') loadPriority4Domain('finance', '/.netlify/functions/admin-finance-data', renderFinance);
  });
}
installPriority4CorrectionStyles(); installGroupedNavigation(); installSectionStatus('website-content','Website content'); installSectionStatus('teaching','Books and teaching'); installSectionStatus('accountability','Accountability'); installRetryHandlers(); installDirtyTracking();
