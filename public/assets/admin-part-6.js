'use strict';
function renderRedemptions() {
  const summary = operationsData.summary || {};
  const records = filteredByInputs(operationsData.redemptions, '#redemptionSearch', '#redemptionStatusFilter', '#redemptionFrom', '#redemptionTo');
  $('#redemptionCount').textContent = summary.redemptionCount ?? operationsData.redemptions.length;
  $('#pendingRedemptionCount').textContent = summary.pendingRedemptionCount ?? operationsData.redemptions.filter((item) => !REDEMPTION_TERMINAL.has(item.status)).length;
  $('#productionRedemptionCount').textContent = operationsData.redemptions.filter((item) => item.status === 'in_production').length;
  $('#shippedRedemptionCount').textContent = operationsData.redemptions.filter((item) => ['shipped', 'delivered', 'fulfilled'].includes(item.status)).length;
  $('#filteredRedemptionCount').textContent = records.length;
  $('#redemptions').innerHTML = records.map((redemption) => `<tr class="border-b border-white/5 align-top"><td class="p-4 font-mono">${escapeHtml(redemption.confirmation)}<p class="text-xs text-slate-500 mt-1">${escapeHtml(redemption.code)}</p></td><td class="p-4">${escapeHtml(redemption.recipient.firstName)} ${escapeHtml(redemption.recipient.lastName)}<br><span class="text-slate-400">${escapeHtml(redemption.recipient.email)}</span></td><td class="p-4">${escapeHtml(redemption.productName)}<br>${escapeHtml(redemption.fit || '—')} · Size ${escapeHtml(redemption.size)}${redemption.color ? ` · ${escapeHtml(redemption.color)}` : ''}</td><td class="p-4 max-w-xs">${escapeHtml(addressText(redemption.recipient))}</td><td class="p-4 font-mono text-xs">${escapeHtml(redemption.batchId || '—')}</td><td class="p-4">${pill(redemption.status)}</td><td class="p-4">${escapeHtml(redemption.tracking || '—')}</td><td class="p-4">${formatDate(redemption.createdAt)}</td><td class="p-4"><button type="button" data-view-redemption="${escapeHtml(redemption.confirmation)}" class="text-amber-400 font-bold">VIEW / UPDATE</button></td></tr>`).join('') || '<tr><td colspan="9" class="p-8 text-center text-slate-400">No redemptions match the current filters.</td></tr>';
  $$('[data-view-redemption]').forEach((button) => button.addEventListener('click', () => openRedemption(button.dataset.viewRedemption)));
}

function openRedemption(confirmation) {
  const redemption = operationsData.redemptions.find((item) => item.confirmation === confirmation);
  if (!redemption) return;
  const history = (redemption.statusHistory || []).slice().reverse();
  openDrawer('Gift fulfillment', confirmation, `<form id="redemptionUpdateForm" class="space-y-6">
    <div class="grid sm:grid-cols-2 gap-4"><div class="card p-4"><span class="label">RECIPIENT</span><strong>${escapeHtml(redemption.recipient.firstName)} ${escapeHtml(redemption.recipient.lastName)}</strong><p class="text-slate-400">${escapeHtml(redemption.recipient.email)}</p></div><div class="card p-4"><span class="label">ITEM</span><strong>${escapeHtml(redemption.productName)}</strong><p class="text-slate-400">${escapeHtml(redemption.fit || '')} · ${escapeHtml(redemption.size)} · ${escapeHtml(redemption.color || '')}</p></div></div>
    <div><span class="label">SHIPPING ADDRESS</span><p class="border border-white/10 rounded-xl p-4">${escapeHtml(addressText(redemption.recipient))}</p></div>
    <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">FULFILLMENT STATUS</span><select id="drawerRedemptionStatus" class="field">${statusOptions(REDEMPTION_STATUSES_UI, redemption.status)}</select></label><label><span class="label">PRODUCTION BATCH</span><input id="drawerRedemptionBatch" class="field" value="${escapeHtml(redemption.batchId || '')}" readonly></label></div>
    <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">SHIPPING PROVIDER</span><input id="drawerRedemptionProvider" class="field" value="${escapeHtml(redemption.shippingProvider || '')}"></label><label><span class="label">TRACKING NUMBER</span><input id="drawerRedemptionTracking" class="field" value="${escapeHtml(redemption.tracking || '')}"></label></div>
    <label><span class="label">INTERNAL NOTES</span><textarea id="drawerRedemptionNotes" class="field" rows="4">${escapeHtml(redemption.internalNotes || '')}</textarea></label>
    <label><span class="label">STATUS-CHANGE NOTE</span><input id="drawerRedemptionChangeNote" class="field"></label>
    <button class="w-full bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl">SAVE FULFILLMENT UPDATE</button><p id="drawerRedemptionMessage" class="text-sm"></p>
    <div><span class="label">STATUS HISTORY</span><div class="space-y-2">${history.map((item) => `<div class="border-l-2 border-white/15 pl-3"><strong>${escapeHtml(humanStatus(item.status))}</strong><p class="text-xs text-slate-400">${formatDate(item.at)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</p></div>`).join('') || '<p class="text-slate-400">No status history recorded.</p>'}</div></div>
  </form>`);
  $('#redemptionUpdateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/.netlify/functions/admin-update-redemption', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        confirmation,
        status: $('#drawerRedemptionStatus').value,
        shippingProvider: $('#drawerRedemptionProvider').value,
        tracking: $('#drawerRedemptionTracking').value,
        internalNotes: $('#drawerRedemptionNotes').value,
        batchId: redemption.batchId || '',
        note: $('#drawerRedemptionChangeNote').value
      }) });
      closeDrawer();
      await loadAll();
    } catch (error) { setMessage($('#drawerRedemptionMessage'), error.message); }
  });
}

function fulfillmentItems() {
  const items = [];
  for (const order of operationsData.orders.filter((record) => !ORDER_TERMINAL.has(record.status))) {
    (order.items || []).forEach((item, index) => items.push({
      sourceType: 'order', sourceId: order.sessionId, sourceItemId: `${order.sessionId}:item:${index}`, itemIndex: index,
      productId: item.productId, productName: item.productName || item.shortName, variantId: item.variantId,
      fit: item.fit, size: item.size, color: item.color, sku: item.sku, variantSku: item.variantSku,
      quantity: Number(item.quantity || 1), owner: order.customerName || order.customerEmail || order.sessionId,
      sourceStatus: order.status
    }));
  }
  for (const redemption of operationsData.redemptions.filter((record) => !REDEMPTION_TERMINAL.has(record.status))) {
    items.push({
      sourceType: 'redemption', sourceId: redemption.confirmation, sourceItemId: `${redemption.confirmation}:redemption`, itemIndex: null,
      productId: redemption.productId, productName: redemption.productName, variantId: redemption.variantId,
      fit: redemption.fit, size: redemption.size, color: redemption.color, variantSku: redemption.variantSku,
      quantity: 1, owner: `${redemption.recipient.firstName} ${redemption.recipient.lastName}`, sourceStatus: redemption.status
    });
  }
  return items;
}

function assignedSourceIds(exceptBatchId = '') {
  return new Set(operationsData.batches.filter((batch) => batch.id !== exceptBatchId && batch.status !== 'cancelled').flatMap((batch) => (batch.items || []).map((item) => item.sourceItemId)));
}

function newBatch() {
  activeBatchId = '';
  currentBatchItems = [];
  $('#batchForm').reset();
  $('#batchId').value = '';
  $('#batchExpectedUpdatedAt').value = '';
  $('#batchFormTitle').textContent = 'New production batch';
  $('#batchStatus').innerHTML = statusOptions(BATCH_STATUSES_UI, 'draft');
  $('#batchStatus').value = 'draft';
  $('#batchStatusMessage').textContent = '';
  renderBatchList();
  renderBatchPicker();
}

function editBatch(id) {
  const batch = operationsData.batches.find((item) => item.id === id);
  if (!batch) return;
  activeBatchId = id;
  currentBatchItems = structuredClone(batch.items || []);
  $('#batchId').value = batch.id;
  $('#batchExpectedUpdatedAt').value = batch.updatedAt || '';
  $('#batchName').value = batch.name || '';
  $('#batchVendor').value = batch.vendor || '';
  $('#batchStatus').innerHTML = statusOptions(BATCH_STATUSES_UI, batch.status);
  $('#batchStatus').value = batch.status;
  $('#batchDueDate').value = batch.dueDate ? new Date(batch.dueDate).toISOString().slice(0, 10) : '';
  $('#batchTracking').value = batch.tracking || '';
  $('#batchNotes').value = batch.notes || '';
  $('#batchUpdateNote').value = '';
  $('#batchFormTitle').textContent = `Edit ${batch.name || batch.id}`;
  $('#batchStatusMessage').textContent = '';
  renderBatchList();
  renderBatchPicker();
}

function renderBatchList() {
  const query = $('#batchSearch')?.value.trim().toLowerCase() || '';
  const status = $('#batchStatusFilter')?.value || '';
  const batches = operationsData.batches.filter((batch) => (!status || batch.status === status) && (!query || recordSearchText(batch).includes(query)));
  $('#batchList').innerHTML = batches.map((batch) => `<button type="button" data-edit-batch="${escapeHtml(batch.id)}" class="w-full text-left p-5 hover:bg-white/5 ${activeBatchId === batch.id ? 'bg-white/5' : ''}"><div class="flex justify-between gap-3"><div><h3 class="font-bold">${escapeHtml(batch.name || batch.id)}</h3><p class="font-mono text-xs text-slate-500 mt-1">${escapeHtml(batch.id)}</p><p class="text-xs text-slate-400 mt-2">${batch.itemCount || 0} units · ${escapeHtml(batch.vendor || 'No vendor')}</p></div><div class="text-right">${pill(batch.status)}<p class="text-xs text-slate-500 mt-2">${batch.dueDate ? `Due ${new Date(batch.dueDate).toLocaleDateString()}` : 'No due date'}</p></div></div></button>`).join('') || '<p class="p-6 text-slate-400">No production batches match the filters.</p>';
  $$('[data-edit-batch]').forEach((button) => button.addEventListener('click', () => editBatch(button.dataset.editBatch)));
}

function renderBatchPicker() {
  if (!$('#batchItemPicker')) return;
  const query = $('#batchItemSearch')?.value.trim().toLowerCase() || '';
  const assignedElsewhere = assignedSourceIds(activeBatchId);
  const selected = new Set(currentBatchItems.map((item) => item.sourceItemId));
  const sourceItems = fulfillmentItems().filter((item) => selected.has(item.sourceItemId) || !assignedElsewhere.has(item.sourceItemId));
  const filtered = sourceItems.filter((item) => !query || recordSearchText(item).includes(query));
  $('#batchItemPicker').innerHTML = filtered.map((item) => `<label class="flex items-start gap-4 p-4 hover:bg-white/5 cursor-pointer"><input type="checkbox" data-batch-item="${escapeHtml(item.sourceItemId)}" class="mt-1 w-5 h-5 accent-amber-400" ${selected.has(item.sourceItemId) ? 'checked' : ''}><div class="flex-1"><div class="flex flex-wrap justify-between gap-3"><div><strong>${escapeHtml(item.productName)}</strong><p class="text-sm text-slate-400">${escapeHtml(item.fit || '—')} · ${escapeHtml(item.size || '—')} · ${escapeHtml(item.color || 'Standard')} · Qty ${item.quantity}</p></div><div class="text-right"><span class="text-xs uppercase font-bold">${escapeHtml(item.sourceType)}</span><p class="font-mono text-xs text-slate-500">${escapeHtml(item.sourceId)}</p></div></div><p class="text-xs text-slate-500 mt-2">${escapeHtml(item.owner)} · ${escapeHtml(humanStatus(item.sourceStatus))}</p></div></label>`).join('') || '<p class="p-6 text-slate-400">No unassigned fulfillment units match this search.</p>';
  $$('[data-batch-item]').forEach((checkbox) => checkbox.addEventListener('change', () => {
    const item = sourceItems.find((candidate) => candidate.sourceItemId === checkbox.dataset.batchItem);
    if (!item) return;
    if (checkbox.checked) currentBatchItems.push(item);
    else currentBatchItems = currentBatchItems.filter((candidate) => candidate.sourceItemId !== item.sourceItemId);
    renderBatchSummary();
  }));
  renderBatchSummary();
}

function renderBatchSummary() {
  const groups = new Map();
  for (const item of currentBatchItems) {
    const key = [item.productId, item.variantId, item.fit, item.size, item.color].join('|');
    const group = groups.get(key) || { ...item, quantity: 0 };
    group.quantity += Number(item.quantity || 0);
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => String(a.productName).localeCompare(String(b.productName)) || String(a.fit).localeCompare(String(b.fit)) || String(a.size).localeCompare(String(b.size)));
  $('#batchProductionSummary').innerHTML = rows.length ? `<table class="w-full text-sm"><thead><tr class="text-left border-b border-white/10"><th class="py-3">Product</th><th>Fit</th><th>Size</th><th>Color</th><th>SKU</th><th>Quantity</th></tr></thead><tbody>${rows.map((item) => `<tr class="border-b border-white/5"><td class="py-3">${escapeHtml(item.productName)}</td><td>${escapeHtml(item.fit || '—')}</td><td>${escapeHtml(item.size || '—')}</td><td>${escapeHtml(item.color || '—')}</td><td class="font-mono text-xs">${escapeHtml(item.variantSku || item.sku || '—')}</td><td class="font-bold">${item.quantity}</td></tr>`).join('')}</tbody></table>` : '<p class="text-slate-400">Select fulfillment units to build the production summary.</p>';
}

function renderAlerts() {
  const severity = $('#alertSeverityFilter')?.value || '';
  const type = $('#alertTypeFilter')?.value || '';
  const alerts = operationsData.alerts.filter((alert) => (!severity || alert.severity === severity) && (!type || alert.type === type));
  $('#alertsList').innerHTML = alerts.map((alert) => `<article class="border rounded-2xl p-5 ${alertClass(alert.severity)}"><div class="flex flex-col sm:flex-row justify-between gap-4"><div><div class="flex flex-wrap gap-2 items-center"><span class="uppercase text-xs font-extrabold">${escapeHtml(alert.severity)}</span><span class="text-xs opacity-70">${escapeHtml(alert.type)}</span><span class="font-mono text-xs opacity-70">${escapeHtml(alert.recordId)}</span></div><h3 class="text-xl font-bold mt-2">${escapeHtml(alert.title)}</h3><p class="mt-2 opacity-80">${escapeHtml(alert.message)}</p></div><button type="button" data-alert-action="${escapeHtml(alert.actionTab)}" class="self-start border border-current rounded-xl px-4 py-2 font-bold">OPEN ${escapeHtml(alert.actionTab.toUpperCase())}</button></div></article>`).join('') || '<div class="card p-8 text-center text-slate-400">No alerts match the current filters.</div>';
  $$('[data-alert-action]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.alertAction)));
}

async function exportRecords(type, searchSelector, statusSelector, fromSelector, toSelector) {
  const params = new URLSearchParams({ type });
  if ($(searchSelector)?.value) params.set('q', $(searchSelector).value);
  if ($(statusSelector)?.value) params.set('status', $(statusSelector).value);
  if ($(fromSelector)?.value) params.set('from', $(fromSelector).value);
  if ($(toSelector)?.value) params.set('to', $(toSelector).value);
  const response = await fetch(`/.netlify/functions/admin-export?${params}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(await response.text() || 'Export could not be generated.');
  const blob = await response.blob();
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  const disposition = response.headers.get('content-disposition') || '';
  anchor.download = disposition.match(/filename="([^"]+)"/)?.[1] || `izhe-${type}.csv`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

$('#createCodes').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await request('/.netlify/functions/admin-create-codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: $('#giveProductId').value, orderRef: $('#orderRef').value, count: Number($('#count').value) }) });
    alert(result.created.map((entry) => entry.code).join('\n'));
    await loadAll();
  } catch (error) { alert(error.message); }
});

$('#batchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#batchStatusMessage');
  message.textContent = 'Saving production batch…';
  message.className = 'text-sm text-slate-400';
  try {
    const result = await request('/.netlify/functions/admin-save-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      expectedUpdatedAt: $('#batchExpectedUpdatedAt').value,
      note: $('#batchUpdateNote').value,
      batch: {
        id: $('#batchId').value,
        name: $('#batchName').value,
        vendor: $('#batchVendor').value,
        status: $('#batchStatus').value,
        dueDate: $('#batchDueDate').value ? new Date(`${$('#batchDueDate').value}T12:00:00`).toISOString() : '',
        tracking: $('#batchTracking').value,
        notes: $('#batchNotes').value,
        items: currentBatchItems
      }
    }) });
    activeBatchId = result.batch.id;
    await loadAll();
    editBatch(activeBatchId);
    setMessage(message, 'Production batch saved and linked fulfillment records were updated.', true);
  } catch (error) { setMessage(message, error.message); }
});

$('#newBatch').addEventListener('click', newBatch);
$('#refresh').addEventListener('click', loadAll);
$('#export').addEventListener('click', () => exportRecords('redemptions', '#redemptionSearch', '#redemptionStatusFilter', '#redemptionFrom', '#redemptionTo').catch((error) => alert(error.message)));
$('#exportOrders').addEventListener('click', () => exportRecords('orders', '#orderSearch', '#orderStatusFilter', '#orderFrom', '#orderTo').catch((error) => alert(error.message)));
$('#exportCodes').addEventListener('click', () => exportRecords('codes', '#codeSearch', '#codeStatusFilter', null, null).catch((error) => alert(error.message)));
$('#exportRedemptions').addEventListener('click', () => exportRecords('redemptions', '#redemptionSearch', '#redemptionStatusFilter', '#redemptionFrom', '#redemptionTo').catch((error) => alert(error.message)));
$('#exportBatches').addEventListener('click', () => exportRecords('batches', '#batchSearch', '#batchStatusFilter', null, null).catch((error) => alert(error.message)));

['orderSearch', 'orderStatusFilter', 'orderFrom', 'orderTo'].forEach((id) => $(`#${id}`).addEventListener(id.includes('Search') ? 'input' : 'change', renderOrders));
['codeSearch', 'codeStatusFilter', 'codeProductFilter'].forEach((id) => $(`#${id}`).addEventListener(id.includes('Search') ? 'input' : 'change', renderCodes));
['redemptionSearch', 'redemptionStatusFilter', 'redemptionFrom', 'redemptionTo'].forEach((id) => $(`#${id}`).addEventListener(id.includes('Search') ? 'input' : 'change', renderRedemptions));
['batchSearch', 'batchStatusFilter'].forEach((id) => $(`#${id}`).addEventListener(id.includes('Search') ? 'input' : 'change', renderBatchList));
$('#batchItemSearch').addEventListener('input', renderBatchPicker);
['alertSeverityFilter', 'alertTypeFilter'].forEach((id) => $(`#${id}`).addEventListener('change', renderAlerts));
$$('[data-go-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.goTab)));
