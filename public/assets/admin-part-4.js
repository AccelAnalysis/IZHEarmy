'use strict';
const ORDER_STATUSES_UI = ['paid', 'processing', 'allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'on_hold', 'cancelled', 'refunded_or_disputed', 'refund_requires_review', 'exception'];
const REDEMPTION_STATUSES_UI = ['pending_fulfillment', 'approved', 'allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'fulfilled', 'on_hold', 'cancelled', 'exception'];
const BATCH_STATUSES_UI = ['draft', 'ready', 'submitted', 'in_production', 'received', 'completed', 'cancelled'];
const ORDER_TERMINAL = new Set(['completed', 'cancelled', 'refunded_or_disputed']);
const REDEMPTION_TERMINAL = new Set(['fulfilled', 'cancelled']);

$('#mediaUploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const status = $('#mediaStatus');
  button.disabled = true;
  button.textContent = 'UPLOADING…';
  try {
    const form = new FormData();
    form.append('file', $('#mediaFile').files[0]);
    form.append('alt', $('#mediaAlt').value);
    const result = await request('/.netlify/functions/admin-upload-media', { method: 'POST', body: form });
    catalogData.media.unshift(result.media);
    renderMedia();
    event.currentTarget.reset();
    setMessage(status, 'Image uploaded to the media library.', true);
  } catch (error) {
    setMessage(status, error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'UPLOAD IMAGE';
  }
});

function pill(status) {
  return `<span class="pill bg-white/5 border border-white/10"><span class="status-dot ${statusColor(status)}"></span>${escapeHtml(humanStatus(status))}</span>`;
}

function statusOptions(statuses, current) {
  return statuses.map((status) => `<option value="${status}"${status === current ? ' selected' : ''}>${escapeHtml(humanStatus(status))}</option>`).join('');
}

function addressText(details) {
  const address = details?.address || details || {};
  return [address.line1 || address.address1, address.line2 || address.address2, address.city, address.state, address.postal_code || address.postalCode, address.country].filter(Boolean).join(', ') || 'No shipping address';
}

function orderItemLabel(item) {
  return `${item.quantity || 1}× ${item.shortName || item.productName || item.productId}${item.fit || item.size ? ` — ${item.fit || ''} ${item.size || ''}`.trim() : ''}`;
}

function filteredByInputs(records, searchSelector, statusSelector, fromSelector, toSelector, statusResolver = (record) => record.status) {
  const query = $(searchSelector)?.value.trim().toLowerCase() || '';
  const status = $(statusSelector)?.value || '';
  const from = $(fromSelector)?.value ? new Date($(fromSelector).value) : null;
  const to = $(toSelector)?.value ? new Date(`${$(toSelector).value}T23:59:59`) : null;
  return records.filter((record) => {
    if (status && statusResolver(record) !== status) return false;
    const date = new Date(record.updatedAt || record.createdAt || 0);
    if (from && date < from) return false;
    if (to && date > to) return false;
    if (query && !recordSearchText(record).includes(query)) return false;
    return true;
  });
}

function openDrawer(title, subtitle, body) {
  $('#recordDrawerTitle').textContent = title;
  $('#recordDrawerSubtitle').textContent = subtitle || '';
  $('#recordDrawerBody').innerHTML = body;
  $('#recordOverlay').classList.remove('hidden');
  $('#recordDrawer').setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    $('#recordOverlay').classList.remove('opacity-0');
    $('#recordDrawer').classList.remove('drawer-hidden');
  });
  document.body.classList.add('modal-open');
}

function closeDrawer() {
  $('#recordOverlay').classList.add('opacity-0');
  $('#recordDrawer').classList.add('drawer-hidden');
  $('#recordDrawer').setAttribute('aria-hidden', 'true');
  setTimeout(() => $('#recordOverlay').classList.add('hidden'), 250);
  document.body.classList.remove('modal-open');
}

$('#recordDrawerClose').addEventListener('click', closeDrawer);
$('#recordOverlay').addEventListener('click', closeDrawer);

function renderOperations() {
  renderOrders();
  renderCodes();
  renderRedemptions();
  renderBatchList();
  renderBatchPicker();
  renderAlerts();
  const eligible = catalogData.catalog.products.filter((product) => product.giveOneEligible && product.status !== 'archived');
  $('#giveProductId').innerHTML = eligible.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.shortName)} — ${escapeHtml(product.audienceLabel)}</option>`).join('');
  $('#codeProductFilter').innerHTML = `<option value="">All products</option>${eligible.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.shortName)} — ${escapeHtml(product.audienceLabel)}</option>`).join('')}`;
  $('#orderStatusFilter').innerHTML = `<option value="">All statuses</option>${statusOptions(ORDER_STATUSES_UI, '')}`;
  $('#redemptionStatusFilter').innerHTML = `<option value="">All statuses</option>${statusOptions(REDEMPTION_STATUSES_UI, '')}`;
  $('#batchStatusFilter').innerHTML = `<option value="">All statuses</option>${statusOptions(BATCH_STATUSES_UI, '')}`;
  $('#batchStatus').innerHTML = statusOptions(BATCH_STATUSES_UI, $('#batchStatus').value || 'draft');
}

function renderOrders() {
  const summary = operationsData.summary || {};
  const records = filteredByInputs(operationsData.orders, '#orderSearch', '#orderStatusFilter', '#orderFrom', '#orderTo');
  $('#orderCount').textContent = summary.orderCount ?? operationsData.orders.length;
  $('#openOrderCount').textContent = summary.pendingOrderCount ?? operationsData.orders.filter((order) => !ORDER_TERMINAL.has(order.status)).length;
  $('#orderGrossSales').textContent = money(summary.grossSales || 0);
  $('#orderUnitCount').textContent = summary.soldUnits || 0;
  $('#filteredOrderCount').textContent = records.length;
  $('#ordersTable').innerHTML = records.map((order) => {
    const assignments = [...new Set((order.batchAssignments || []).map((assignment) => assignment.batchId).filter(Boolean))];
    return `<tr class="border-b border-white/5 align-top">
      <td class="p-4"><strong class="font-mono text-xs">${escapeHtml(order.sessionId)}</strong><p class="text-slate-500 mt-1">${formatDate(order.createdAt)}</p></td>
      <td class="p-4"><strong>${escapeHtml(order.customerName || 'Customer')}</strong><p class="text-slate-400">${escapeHtml(order.customerEmail || '—')}</p></td>
      <td class="p-4">${(order.items || []).map((item) => `<div>${escapeHtml(orderItemLabel(item))}</div>`).join('') || '—'}</td>
      <td class="p-4"><strong>${money(order.amountTotal)}</strong><p class="text-slate-500">${escapeHtml((order.currency || 'usd').toUpperCase())}</p></td>
      <td class="p-4 max-w-xs">${escapeHtml(addressText(order.shippingDetails))}${order.tracking ? `<p class="text-sky-300 mt-1">${escapeHtml(order.tracking)}</p>` : ''}</td>
      <td class="p-4">${(order.giveCodes || []).length}<p class="text-slate-500">claim code${(order.giveCodes || []).length === 1 ? '' : 's'}</p></td>
      <td class="p-4">${assignments.length ? assignments.map((id) => `<div class="font-mono text-xs">${escapeHtml(id)}</div>`).join('') : '—'}</td>
      <td class="p-4">${pill(order.status)}</td>
      <td class="p-4">${formatDate(order.updatedAt || order.createdAt)}</td>
      <td class="p-4"><button type="button" data-view-order="${escapeHtml(order.sessionId)}" class="text-amber-400 font-bold">VIEW / UPDATE</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="p-8 text-center text-slate-400">No orders match the current filters.</td></tr>';
  $$('[data-view-order]').forEach((button) => button.addEventListener('click', () => openOrder(button.dataset.viewOrder)));
}

function openOrder(sessionId) {
  const order = operationsData.orders.find((item) => item.sessionId === sessionId);
  if (!order) return;
  const history = (order.statusHistory || []).slice().reverse();
  openDrawer('Order details', sessionId, `<form id="orderUpdateForm" class="space-y-6">
    <div class="grid sm:grid-cols-2 gap-4"><div class="card p-4"><span class="label">CUSTOMER</span><strong>${escapeHtml(order.customerName || 'Customer')}</strong><p class="text-slate-400">${escapeHtml(order.customerEmail || '')}</p></div><div class="card p-4"><span class="label">TOTAL</span><strong class="text-2xl">${money(order.amountTotal)}</strong><p class="text-slate-400">Payment: ${escapeHtml(order.paymentStatus || '—')}</p></div></div>
    <div><span class="label">ORDER ITEMS</span><div class="space-y-2">${(order.items || []).map((item, index) => `<div class="border border-white/10 rounded-xl p-3"><strong>${escapeHtml(orderItemLabel(item))}</strong><p class="text-xs text-slate-400 mt-1">SKU ${escapeHtml(item.variantSku || item.sku || '—')} · Item ${index + 1}</p></div>`).join('')}</div></div>
    <div><span class="label">SHIPPING ADDRESS</span><p class="border border-white/10 rounded-xl p-4">${escapeHtml(addressText(order.shippingDetails))}</p></div>
    <div><span class="label">GIVE ONE CODES</span><div class="font-mono text-sm border border-white/10 rounded-xl p-4">${(order.giveCodes || []).map((item) => escapeHtml(item.code)).join('<br>') || 'None'}</div></div>
    <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">OPERATIONAL STATUS</span><select id="drawerOrderStatus" class="field">${statusOptions(ORDER_STATUSES_UI, order.status)}</select></label><label><span class="label">SHIPPING PROVIDER</span><input id="drawerOrderProvider" class="field" value="${escapeHtml(order.shippingProvider || '')}"></label></div>
    <label><span class="label">TRACKING NUMBER</span><input id="drawerOrderTracking" class="field" value="${escapeHtml(order.tracking || '')}"></label>
    <label><span class="label">INTERNAL NOTES</span><textarea id="drawerOrderNotes" class="field" rows="4">${escapeHtml(order.internalNotes || '')}</textarea></label>
    <label><span class="label">STATUS-CHANGE NOTE</span><input id="drawerOrderChangeNote" class="field" placeholder="Reason or operational update"></label>
    <button class="w-full bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl">SAVE ORDER UPDATE</button><p id="drawerOrderMessage" class="text-sm"></p>
    <div><span class="label">STATUS HISTORY</span><div class="space-y-2">${history.map((item) => `<div class="border-l-2 border-white/15 pl-3"><strong>${escapeHtml(humanStatus(item.status))}</strong><p class="text-xs text-slate-400">${formatDate(item.at)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</p></div>`).join('') || '<p class="text-slate-400">No status history recorded.</p>'}</div></div>
  </form>`);
  $('#orderUpdateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/.netlify/functions/admin-update-order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        sessionId,
        status: $('#drawerOrderStatus').value,
        shippingProvider: $('#drawerOrderProvider').value,
        tracking: $('#drawerOrderTracking').value,
        internalNotes: $('#drawerOrderNotes').value,
        note: $('#drawerOrderChangeNote').value
      }) });
      closeDrawer();
      await loadAll();
    } catch (error) { setMessage($('#drawerOrderMessage'), error.message); }
  });
}

function renderCodes() {
  const productFilter = $('#codeProductFilter')?.value || '';
  let records = filteredByInputs(operationsData.codes, '#codeSearch', '#codeStatusFilter', null, null, (code) => code.effectiveStatus || code.status);
  if (productFilter) records = records.filter((code) => code.productId === productFilter);
  const statuses = operationsData.codes.map((code) => code.effectiveStatus || code.status);
  $('#codeCount').textContent = operationsData.codes.length;
  $('#activeCount').textContent = statuses.filter((status) => status === 'active').length;
  $('#redeemedCodeCount').textContent = statuses.filter((status) => status === 'redeemed').length;
  $('#expiredCodeCount').textContent = statuses.filter((status) => status === 'expired').length;
  $('#filteredCodeCount').textContent = records.length;
  $('#codesTable').innerHTML = records.map((code) => {
    const status = code.effectiveStatus || code.status;
    return `<tr class="border-b border-white/5 align-top"><td class="p-4 font-mono font-bold">${escapeHtml(code.code)}</td><td class="p-4">${escapeHtml(code.productName || code.productId)}</td><td class="p-4 font-mono text-xs">${escapeHtml(code.sourceSessionId || '—')}</td><td class="p-4">${escapeHtml(code.purchaserEmail || '—')}</td><td class="p-4">${pill(status)}</td><td class="p-4">${formatDate(code.createdAt)}</td><td class="p-4">${code.redeemedAt ? `Redeemed ${formatDate(code.redeemedAt)}` : code.expiresAt ? `Expires ${formatDate(code.expiresAt)}` : 'No expiration'}</td><td class="p-4 font-mono text-xs">${escapeHtml(code.replacementCode || code.replacementFor || '—')}</td><td class="p-4"><button type="button" data-view-code="${escapeHtml(code.code)}" class="text-amber-400 font-bold">MANAGE</button></td></tr>`;
  }).join('') || '<tr><td colspan="9" class="p-8 text-center text-slate-400">No Give One codes match the current filters.</td></tr>';
  $$('[data-view-code]').forEach((button) => button.addEventListener('click', () => openCode(button.dataset.viewCode)));
}

function openCode(codeValue) {
  const code = operationsData.codes.find((item) => item.code === codeValue);
  if (!code) return;
  const eligible = catalogData.catalog.products.filter((product) => product.giveOneEligible && product.status !== 'archived');
  openDrawer('Manage Give One code', codeValue, `<form id="codeUpdateForm" class="space-y-5">
    <div class="grid sm:grid-cols-2 gap-4"><div class="card p-4"><span class="label">STATUS</span>${pill(code.effectiveStatus || code.status)}</div><div class="card p-4"><span class="label">PRODUCT</span><strong>${escapeHtml(code.productName || code.productId)}</strong></div></div>
    <div class="card p-4 text-sm"><p><strong>Source:</strong> ${escapeHtml(code.sourceSessionId || '—')}</p><p class="mt-2"><strong>Created:</strong> ${formatDate(code.createdAt)}</p><p class="mt-2"><strong>Redemption:</strong> ${escapeHtml(code.redemptionId || '—')}</p><p class="mt-2"><strong>Replacement:</strong> ${escapeHtml(code.replacementCode || code.replacementFor || '—')}</p></div>
    <label><span class="label">ACTION</span><select id="drawerCodeAction" class="field"><option value="note">Update note only</option><option value="cancel">Cancel unused code</option><option value="reactivate">Reactivate cancelled/expired code</option><option value="extend">Set or extend expiration</option><option value="transfer">Transfer to another eligible product</option><option value="reissue">Reissue with a new code</option></select></label>
    <label><span class="label">EXPIRATION DATE</span><input id="drawerCodeExpiration" type="date" class="field" value="${code.expiresAt ? new Date(code.expiresAt).toISOString().slice(0, 10) : ''}"></label>
    <label><span class="label">TRANSFER PRODUCT</span><select id="drawerCodeProduct" class="field">${eligible.map((product) => `<option value="${escapeHtml(product.id)}"${product.id === code.productId ? ' selected' : ''}>${escapeHtml(product.shortName)} — ${escapeHtml(product.audienceLabel)}</option>`).join('')}</select></label>
    <label><span class="label">REASON</span><input id="drawerCodeReason" class="field" placeholder="Why this action is being taken"></label>
    <label><span class="label">ADMIN NOTE</span><textarea id="drawerCodeNote" class="field" rows="4">${escapeHtml(code.adminNote || '')}</textarea></label>
    <button class="w-full bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl">APPLY GIVE ONE ACTION</button><p id="drawerCodeMessage" class="text-sm"></p>
  </form>`);
  $('#codeUpdateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = $('#drawerCodeAction').value;
    if (['cancel', 'reissue', 'transfer'].includes(action) && !confirm(`Apply ${humanStatus(action)} to ${codeValue}?`)) return;
    try {
      const result = await request('/.netlify/functions/admin-update-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        code: codeValue,
        action,
        expiresAt: $('#drawerCodeExpiration').value ? new Date(`${$('#drawerCodeExpiration').value}T23:59:59`).toISOString() : '',
        productId: $('#drawerCodeProduct').value,
        reason: $('#drawerCodeReason').value,
        note: $('#drawerCodeNote').value
      }) });
      if (result.replacement) alert(`Replacement code: ${result.replacement.code}`);
      closeDrawer();
      await loadAll();
    } catch (error) { setMessage($('#drawerCodeMessage'), error.message); }
  });
}
