'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
const slug = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '');
const statusColor = (status) => ({
  published: 'bg-green-400', draft: 'bg-amber-400', hidden: 'bg-slate-400', archived: 'bg-purple-400',
  available: 'bg-green-400', preorder: 'bg-blue-400', paused: 'bg-amber-400', sold_out: 'bg-red-400', retired: 'bg-slate-500',
  paid: 'bg-blue-400', processing: 'bg-blue-400', approved: 'bg-blue-400', allocated: 'bg-indigo-400', in_production: 'bg-purple-400',
  ready_to_ship: 'bg-cyan-400', shipped: 'bg-sky-400', delivered: 'bg-green-400', completed: 'bg-green-400', fulfilled: 'bg-green-400',
  pending_fulfillment: 'bg-amber-400', on_hold: 'bg-amber-400', cancelled: 'bg-red-400', refunded_or_disputed: 'bg-red-400',
  refund_requires_review: 'bg-red-500', exception: 'bg-red-500', active: 'bg-green-400', redeemed: 'bg-blue-400', expired: 'bg-slate-400',
  reissued: 'bg-purple-400', ready: 'bg-cyan-400', submitted: 'bg-indigo-400', received: 'bg-teal-400'
}[status] || 'bg-slate-400');
const toLocalInput = (value) => value ? new Date(value).toISOString().slice(0, 16) : '';
const toIso = (value) => value ? new Date(value).toISOString() : '';
const formatDate = (value) => value ? new Date(value).toLocaleString() : '—';
const humanStatus = (value) => String(value || '').replaceAll('_', ' ');
const recordSearchText = (record) => JSON.stringify(record || {}).toLowerCase();
let token = localStorage.getItem('izhe-admin-token') || '';
let catalogData = null;
let operationsData = { orders: [], redemptions: [], codes: [], batches: [], alerts: [], summary: {} };
let currentImages = [];
let currentVariants = [];
let activeProductId = '';
let activeBatchId = '';
let currentBatchItems = [];

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body;
}

function setMessage(element, message, ok = false) {
  element.textContent = message;
  element.className = `text-sm ${ok ? 'text-green-400' : 'text-red-400'}`;
}

function showTab(name) {
  $$('[data-tab]').forEach((button) => button.classList.toggle('tab-active', button.dataset.tab === name));
  $$('[data-tab-panel]').forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== name; });
}

async function loadAll() {
  try {
    [catalogData, operationsData] = await Promise.all([
      request('/.netlify/functions/admin-catalog'),
      request('/.netlify/functions/admin-data')
    ]);
    $('#login').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    $('#previewCatalog').classList.remove('hidden');
    renderAll();
    if (!$('#collectionOriginalId').value) newCollection();
    if (!activeProductId) newProduct(); else editProduct(activeProductId);
    if (!activeBatchId) newBatch(); else editBatch(activeBatchId);
  } catch (error) {
    $('#login').classList.remove('hidden');
    $('#dashboard').classList.add('hidden');
    $('#loginStatus').textContent = error.message;
  }
}

function renderAll() {
  $('#updated').textContent = `Catalog revision ${catalogData.catalog.revision} · Operations refreshed ${new Date(operationsData.generatedAt || Date.now()).toLocaleString()}`;
  populateCollectionOptions();
  renderOverview();
  renderCollectionList();
  renderProductList();
  renderMedia();
  renderOperations();
}

function alertClass(severity) {
  if (severity === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-200';
  if (severity === 'warning') return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
  return 'border-sky-400/30 bg-sky-400/10 text-sky-100';
}

function renderOverview() {
  const catalog = catalogData.catalog;
  const published = catalog.products.filter((product) => product.status === 'published');
  const unavailable = published.filter((product) => !['available', 'preorder'].includes(product.availabilityStatus));
  const summary = operationsData.summary || {};
  $('#collectionCount').textContent = catalog.collections.length;
  $('#productCount').textContent = catalog.products.length;
  $('#publishedCount').textContent = published.length;
  $('#unavailableCount').textContent = unavailable.length;
  $('#catalogRevision').textContent = catalog.revision;
  $('#overviewOrders').textContent = summary.orderCount ?? operationsData.orders.length;
  $('#overviewCodes').textContent = summary.activeCodeCount ?? operationsData.codes.filter((code) => (code.effectiveStatus || code.status) === 'active').length;
  $('#overviewPending').textContent = summary.pendingRedemptionCount ?? operationsData.redemptions.filter((redemption) => redemption.status === 'pending_fulfillment').length;
  $('#overviewMedia').textContent = catalogData.media.length;
  $('#opsGrossSales').textContent = money(summary.grossSales || 0);
  $('#opsSoldUnits').textContent = summary.soldUnits || 0;
  $('#opsGiftUnits').textContent = summary.giftUnits || 0;
  $('#opsOpenBatches').textContent = summary.openBatchCount || 0;
  $('#opsAlertCount').textContent = operationsData.alerts.length;
  $('#alertBadge').textContent = operationsData.alerts.length;

  const alerts = [];
  for (const collection of catalog.collections.filter((item) => item.status === 'published' && !['available', 'preorder'].includes(item.availabilityStatus))) alerts.push(`${collection.shortTitle} is published but ${humanStatus(collection.availabilityStatus)}.`);
  for (const product of published.filter((item) => !item.images?.length)) alerts.push(`${product.shortName} is published without an image.`);
  for (const product of published.filter((item) => item.productType === 'apparel' && !item.variants?.some((variant) => variant.status === 'active' && ['available', 'preorder'].includes(variant.availabilityStatus)))) alerts.push(`${product.shortName} has no purchasable variants.`);
  for (const product of unavailable) alerts.push(`${product.shortName} is published but ${humanStatus(product.availabilityStatus)}.`);
  $('#catalogAlerts').innerHTML = alerts.length
    ? alerts.map((alert) => `<div class="border border-amber-400/20 bg-amber-400/5 rounded-xl px-4 py-3 text-amber-200">${escapeHtml(alert)}</div>`).join('')
    : '<div class="border border-green-400/20 bg-green-400/5 rounded-xl px-4 py-3 text-green-300">No catalog issues require attention.</div>';

  $('#overviewOperationalAlerts').innerHTML = operationsData.alerts.length
    ? operationsData.alerts.slice(0, 5).map((alert) => `<button type="button" data-alert-tab="${escapeHtml(alert.actionTab)}" class="w-full text-left border rounded-xl p-4 ${alertClass(alert.severity)}"><div class="flex justify-between gap-4"><div><strong>${escapeHtml(alert.title)}</strong><p class="text-sm opacity-80 mt-1">${escapeHtml(alert.message)}</p></div><span class="uppercase text-xs font-extrabold">${escapeHtml(alert.severity)}</span></div></button>`).join('')
    : '<div class="border border-green-400/20 bg-green-400/5 rounded-xl px-4 py-4 text-green-300">No operational alerts require attention.</div>';
  $$('[data-alert-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.alertTab)));
}

function populateCollectionOptions() {
  const options = catalogData.catalog.collections.slice().sort((a, b) => a.displayOrder - b.displayOrder).map((collection) => `<option value="${escapeHtml(collection.id)}">${escapeHtml(collection.shortTitle)} — ${escapeHtml(collection.title)}</option>`).join('');
  $('#productCollection').innerHTML = options;
  $('#productCollectionFilter').innerHTML = `<option value="">All collections</option>${options}`;
}

function renderCollectionList() {
  const collections = catalogData.catalog.collections.slice().sort((a, b) => a.displayOrder - b.displayOrder);
  $('#collectionList').innerHTML = collections.map((collection) => {
    const productCount = catalogData.catalog.products.filter((product) => product.collectionId === collection.id).length;
    return `<button type="button" data-edit-collection="${escapeHtml(collection.id)}" class="w-full text-left p-5 hover:bg-white/5"><div class="flex justify-between gap-3"><div><h3 class="font-bold">${escapeHtml(collection.shortTitle)}</h3><p class="text-sm text-slate-400 mt-1">${escapeHtml(collection.title)}</p><p class="text-xs text-slate-500 mt-2">${productCount} product${productCount === 1 ? '' : 's'}</p></div><div class="text-right text-xs"><span class="block"><span class="status-dot ${statusColor(collection.status)}"></span>${escapeHtml(collection.status)}</span><span class="block mt-2 text-slate-400">${escapeHtml(collection.availabilityStatus)}</span></div></div></button>`;
  }).join('');
  $$('[data-edit-collection]').forEach((button) => button.addEventListener('click', () => editCollection(button.dataset.editCollection)));
}

function newCollection() {
  $('#collectionForm').reset();
  $('#collectionOriginalId').value = '';
  $('#collectionId').disabled = false;
  $('#collectionFormTitle').textContent = 'New collection';
  $('#collectionDisplayOrder').value = String(Math.max(0, ...catalogData.catalog.collections.map((collection) => Number(collection.displayOrder || 0))) + 1);
  $('#collectionStatus').value = 'draft';
  $('#collectionAvailability').value = 'paused';
  $('#collectionStatusMessage').textContent = '';
}

function editCollection(id) {
  const collection = catalogData.catalog.collections.find((item) => item.id === id);
  if (!collection) return;
  $('#collectionOriginalId').value = collection.id;
  $('#collectionId').value = collection.id;
  $('#collectionId').disabled = true;
  $('#collectionSlug').value = collection.slug;
  $('#collectionShortTitle').value = collection.shortTitle;
  $('#collectionDisplayOrder').value = collection.displayOrder;
  $('#collectionTitle').value = collection.title;
  $('#collectionSubtitle').value = collection.subtitle || '';
  $('#collectionDescription').value = collection.description || '';
  $('#collectionBookTitle').value = collection.bookTitle || '';
  $('#collectionBookSubtitle').value = collection.bookSubtitle || '';
  $('#collectionHeroImage').value = collection.heroImage || '';
  $('#collectionStatus').value = collection.status;
  $('#collectionAvailability').value = collection.availabilityStatus;
  $('#collectionAvailableFrom').value = toLocalInput(collection.availableFrom);
  $('#collectionAvailableUntil').value = toLocalInput(collection.availableUntil);
  $('#collectionFormTitle').textContent = `Edit ${collection.shortTitle}`;
  $('#collectionStatusMessage').textContent = '';
}
