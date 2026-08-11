'use strict';
(() => {
  if (typeof campaignAdminData === 'undefined' || !document.querySelector('#campaignForm')) return;

  const pickupFieldIds = [
    'churchPickupLocationName','churchAddress1','churchAddress2','churchCity','churchState','churchPostalCode',
    'churchEstimatedReadyAt','churchPickupStartAt','churchPickupEndAt','churchPublicInstructions','churchInternalInstructions',
    'churchContactName','churchContactEmail','churchContactPhone'
  ];

  function installCampaignPickupFields() {
    if ($('#churchBatchSection')) return;
    const fulfillmentNotes = $('#campaignFulfillmentNotes')?.closest('label');
    if (!fulfillmentNotes) return;
    fulfillmentNotes.insertAdjacentHTML('beforebegin', `<section id="churchBatchSection" class="border border-amber-400/20 bg-amber-400/5 rounded-2xl p-5 space-y-5 hidden">
      <div class="flex flex-wrap justify-between gap-4"><div><p class="label text-amber-300">CHURCH BATCH AND PICKUP</p><h3 class="text-xl font-bold">Consolidated campaign delivery</h3><p class="text-sm text-slate-400 mt-2 max-w-3xl">Church pickup removes the individual customer shipping charge. Paid pickup orders are consolidated into campaign production batches, delivered to this location, and handed to purchasers by the church or ministry. Give One recipient fulfillment remains separate in this phase.</p></div><div id="churchBatchHealth" class="text-sm rounded-xl border border-white/10 px-4 py-3 h-fit"></div></div>
      <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4"><label><span class="label">PICKUP LOCATION NAME</span><input id="churchPickupLocationName" class="field" maxlength="180"></label><label><span class="label">STREET ADDRESS</span><input id="churchAddress1" class="field" maxlength="180"></label><label><span class="label">ADDRESS LINE 2</span><input id="churchAddress2" class="field" maxlength="180"></label><label><span class="label">CITY</span><input id="churchCity" class="field" maxlength="120"></label><label><span class="label">STATE</span><input id="churchState" class="field" maxlength="2" placeholder="VA"></label><label><span class="label">ZIP</span><input id="churchPostalCode" class="field" maxlength="10" placeholder="23314"></label></div>
      <div class="grid md:grid-cols-3 gap-4"><label><span class="label">ESTIMATED READY DATE</span><input id="churchEstimatedReadyAt" type="datetime-local" class="field"></label><label><span class="label">PICKUP WINDOW START</span><input id="churchPickupStartAt" type="datetime-local" class="field"></label><label><span class="label">PICKUP WINDOW END</span><input id="churchPickupEndAt" type="datetime-local" class="field"></label></div>
      <label><span class="label">PUBLIC PURCHASER INSTRUCTIONS</span><textarea id="churchPublicInstructions" class="field" rows="4" maxlength="2500" placeholder="Where to enter, what to bring, pickup desk or ministry area, and any public handoff instructions."></textarea></label>
      <label><span class="label">INTERNAL FULFILLMENT INSTRUCTIONS</span><textarea id="churchInternalInstructions" class="field" rows="3" maxlength="2500" placeholder="Vendor delivery, receiving, staging, or internal church instructions. Not shown publicly."></textarea></label>
      <div class="grid md:grid-cols-3 gap-4"><label><span class="label">CHURCH PICKUP CONTACT</span><input id="churchContactName" class="field" maxlength="160"></label><label><span class="label">CONTACT EMAIL</span><input id="churchContactEmail" type="email" class="field" maxlength="254"></label><label><span class="label">CONTACT PHONE</span><input id="churchContactPhone" class="field" maxlength="40"></label></div>
      <p class="text-xs text-slate-500">The public campaign page receives only the pickup location, address, public instructions, and public pickup dates. Internal instructions and church contact details remain administrator-only.</p>
    </section>`);

    const actions = $('#campaignActions');
    actions?.insertAdjacentHTML('afterbegin', `<div id="churchPickupMetrics" class="hidden grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4"></div>`);
    $('#createCampaignBatch')?.insertAdjacentHTML('afterend', '<button id="exportPickupRoster" type="button" class="border border-white/15 px-5 py-3 rounded-xl font-bold hidden">EXPORT PICKUP ROSTER CSV</button>');
    pickupFieldIds.forEach((id) => $(`#${id}`)?.addEventListener('input', updateChurchBatchUI));
    $('#campaignFulfillmentMethod')?.addEventListener('change', updateChurchBatchUI);
  }

  function localHealth() {
    const method = $('#campaignFulfillmentMethod')?.value || 'individual_shipping';
    if (method === 'individual_shipping') return { complete: true, messages: [] };
    const messages = [];
    if (!$('#churchPickupLocationName').value.trim()) messages.push('Pickup location name required');
    if (!$('#churchAddress1').value.trim()) messages.push('Pickup address required');
    if (!$('#churchCity').value.trim()) messages.push('Pickup city required');
    if (!/^[A-Za-z]{2}$/.test($('#churchState').value.trim())) messages.push('Two-letter state required');
    if (!/^\d{5}(?:-\d{4})?$/.test($('#churchPostalCode').value.trim())) messages.push('Valid ZIP required');
    if (!$('#churchPublicInstructions').value.trim()) messages.push('Public pickup instructions required');
    if (!$('#churchEstimatedReadyAt').value && !$('#churchPickupStartAt').value) messages.push('Pickup date not yet scheduled');
    return { complete: !messages.some((item) => item.includes('required') || item.includes('Valid ZIP') || item.includes('state')), messages };
  }

  function renderPickupMetrics() {
    const box = $('#churchPickupMetrics');
    if (!box) return;
    const report = campaignAdminData.reports.find((item) => item.campaignId === activeCampaignId);
    const method = $('#campaignFulfillmentMethod')?.value || 'individual_shipping';
    box.classList.toggle('hidden', !activeCampaignId || !['church_batch','hybrid'].includes(method));
    if (!report || box.classList.contains('hidden')) return;
    const cards = [
      ['Paid pickup orders', report.churchPickupOrderCount || 0],
      ['Paid pickup units', report.churchPickupUnitCount || 0],
      ['Unbatched units', report.unbatchedChurchPickupUnits || 0],
      ['Batched units', report.batchedChurchPickupUnits || 0],
      ['Units in production', report.churchPickupUnitsInProduction || 0],
      ['Ready for pickup', report.readyForPickupOrderCount || 0],
      ['Picked up', report.pickedUpOrderCount || 0],
      ['Pickup exceptions', report.pickupExceptionCount || 0]
    ];
    if (method === 'hybrid') cards.push(['Direct-shipping orders', report.directShippingOrderCount || 0]);
    box.innerHTML = cards.map(([label, value]) => `<div class="border border-white/10 rounded-xl p-3"><p class="text-xs text-slate-400">${escapeHtml(label)}</p><strong class="text-2xl">${escapeHtml(value)}</strong></div>`).join('');
  }

  function updateChurchBatchUI() {
    const method = $('#campaignFulfillmentMethod')?.value || 'individual_shipping';
    const pickup = ['church_batch','hybrid'].includes(method);
    $('#churchBatchSection')?.classList.toggle('hidden', !pickup);
    $('#exportPickupRoster')?.classList.toggle('hidden', !pickup || !activeCampaignId);
    const batchButton = $('#createCampaignBatch');
    if (batchButton) batchButton.textContent = pickup ? 'BUILD OR REFRESH CHURCH PICKUP BATCH' : 'CREATE FULFILLMENT BATCH';
    const health = $('#churchBatchHealth');
    if (health && pickup) {
      const result = localHealth();
      health.className = `text-sm rounded-xl border px-4 py-3 h-fit ${result.complete ? 'border-green-400/30 text-green-300 bg-green-400/5' : 'border-amber-400/30 text-amber-200 bg-amber-400/5'}`;
      health.innerHTML = result.complete
        ? `<strong>Church pickup configuration complete</strong>${result.messages.length ? `<p class="mt-1">${escapeHtml(result.messages.join(' · '))}</p>` : ''}`
        : `<strong>Campaign cannot accept church-pickup orders until completed</strong><p class="mt-1">${escapeHtml(result.messages.join(' · '))}</p>`;
    }
    renderPickupMetrics();
  }

  function churchBatchPayload() {
    return {
      pickupLocationName: $('#churchPickupLocationName').value,
      address1: $('#churchAddress1').value,
      address2: $('#churchAddress2').value,
      city: $('#churchCity').value,
      state: $('#churchState').value,
      postalCode: $('#churchPostalCode').value,
      country: 'US',
      publicInstructions: $('#churchPublicInstructions').value,
      internalInstructions: $('#churchInternalInstructions').value,
      estimatedReadyAt: toIso($('#churchEstimatedReadyAt').value),
      pickupStartAt: toIso($('#churchPickupStartAt').value),
      pickupEndAt: toIso($('#churchPickupEndAt').value),
      contactName: $('#churchContactName').value,
      contactEmail: $('#churchContactEmail').value,
      contactPhone: $('#churchContactPhone').value
    };
  }

  function populateChurchBatch(campaign) {
    const pickup = campaign?.churchBatch || {};
    const values = {
      churchPickupLocationName: pickup.pickupLocationName || '', churchAddress1: pickup.address1 || '', churchAddress2: pickup.address2 || '',
      churchCity: pickup.city || '', churchState: pickup.state || '', churchPostalCode: pickup.postalCode || '',
      churchEstimatedReadyAt: toLocalInput(pickup.estimatedReadyAt), churchPickupStartAt: toLocalInput(pickup.pickupStartAt), churchPickupEndAt: toLocalInput(pickup.pickupEndAt),
      churchPublicInstructions: pickup.publicInstructions || '', churchInternalInstructions: pickup.internalInstructions || '',
      churchContactName: pickup.contactName || '', churchContactEmail: pickup.contactEmail || '', churchContactPhone: pickup.contactPhone || ''
    };
    for (const [id, value] of Object.entries(values)) if ($(`#${id}`)) $(`#${id}`).value = value;
    updateChurchBatchUI();
  }

  function installOverrides() {
    const originalCollect = collectCampaign;
    collectCampaign = function collectCampaignWithPickup() {
      return { ...originalCollect(), churchBatch: churchBatchPayload() };
    };
    const originalEdit = editCampaign;
    editCampaign = function editCampaignWithPickup(id) {
      originalEdit(id);
      const campaign = campaignAdminData.campaigns.find((item) => item.id === id);
      populateChurchBatch(campaign);
    };
    const originalNew = newCampaign;
    newCampaign = function newCampaignWithPickup(inquiryId = '') {
      originalNew(inquiryId);
      pickupFieldIds.forEach((id) => { if ($(`#${id}`)) $(`#${id}`).value = ''; });
      updateChurchBatchUI();
    };
  }

  async function buildPickupBatch(event) {
    const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId);
    if (!campaign || !['church_batch','hybrid'].includes(campaign.fulfillmentMethod)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message = $('#campaignStatusMessage');
    message.textContent = 'Building church pickup batch…';
    message.className = 'text-sm text-slate-400';
    try {
      const result = await request('/.netlify/functions/admin-build-church-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaignId: campaign.id }) });
      const excluded = result.ordersExcluded ? ` ${result.ordersExcluded} order(s) were excluded; review the returned reasons if reconciliation is needed.` : '';
      setMessage(message, result.batch ? `${result.created ? 'Created' : 'Refreshed'} ${result.batch.name}: ${result.ordersIncluded} order(s), ${result.unitsIncluded} unit(s).${excluded}` : result.message, true);
      await Promise.all([loadAll(), loadCampaignData()]);
    } catch (error) { setMessage(message, error.message); }
  }

  async function exportRoster() {
    const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId);
    if (!campaign) return;
    const response = await fetch(`/.netlify/functions/admin-pickup-roster?campaignId=${encodeURIComponent(campaign.id)}&format=csv`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return setMessage($('#campaignStatusMessage'), body.error || 'Pickup roster could not be exported.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${campaign.slug || campaign.id}-pickup-roster.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function pickupAddress(location) {
    return [location?.address1, location?.address2, location?.city, location?.state, location?.postalCode].filter(Boolean).join(', ');
  }

  function installOrderPickupPanel(order) {
    const form = $('#orderUpdateForm');
    if (!form || order.fulfillment?.mode !== 'church_batch' || $('#pickupHandoffPanel')) return;
    const location = order.fulfillment.pickupLocation || {};
    const handoff = order.pickupHandoff || {};
    const canPickup = order.fulfillment.status === 'ready_for_pickup' || order.status === 'ready_for_pickup';
    const pickedUp = order.fulfillment.status === 'picked_up';
    form.insertAdjacentHTML('afterbegin', `<section id="pickupHandoffPanel" class="border border-amber-400/20 bg-amber-400/5 rounded-2xl p-5 space-y-4">
      <div class="flex flex-wrap justify-between gap-3"><div><span class="label text-amber-300">CHURCH PICKUP</span><h3 class="text-xl font-bold">${escapeHtml(location.pickupLocationName || 'Campaign pickup')}</h3><p class="text-slate-400 mt-1">${escapeHtml(pickupAddress(location))}</p></div><div class="text-right"><span class="label">PICKUP CODE</span><strong class="font-mono text-xl block">${escapeHtml(order.pickupCode || '—')}</strong></div></div>
      <p class="text-sm text-slate-300">${escapeHtml(order.fulfillment.publicInstructions || '')}</p>
      <div class="grid sm:grid-cols-2 gap-3"><label><span class="label">RELEASED BY</span><input id="pickupReleasedBy" class="field" value="${escapeHtml(handoff.releasedBy || '')}" placeholder="Administrator / volunteer name"></label><label><span class="label">RECIPIENT NAME</span><input id="pickupRecipientName" class="field" value="${escapeHtml(handoff.recipientName || order.customerName || '')}"></label></div>
      <label><span class="label">PICKUP / EXCEPTION NOTE</span><input id="pickupNote" class="field" placeholder="Required for exceptions and reversals"></label>
      <div class="flex flex-wrap gap-2"><button id="markPickedUp" type="button" class="bg-green-400 text-slate-950 px-4 py-3 rounded-xl font-extrabold ${canPickup ? '' : 'opacity-40'}" ${canPickup ? '' : 'disabled'}>MARK PICKED UP</button><button id="markPickupNoShow" type="button" class="border border-white/15 px-4 py-3 rounded-xl font-bold" ${pickedUp ? 'disabled' : ''}>MARK NO-SHOW</button><button id="markPickupException" type="button" class="border border-white/15 px-4 py-3 rounded-xl font-bold" ${pickedUp ? 'disabled' : ''}>MARK EXCEPTION</button>${pickedUp ? '<button id="reversePickup" type="button" class="border border-red-400/30 text-red-300 px-4 py-3 rounded-xl font-bold">REVERSE PICKUP CONFIRMATION</button>' : ''}</div>
      ${handoff.pickedUpAt ? `<p class="text-sm text-green-300">Picked up ${escapeHtml(formatDate(handoff.pickedUpAt))} · Released by ${escapeHtml(handoff.releasedBy || '—')} · Recipient ${escapeHtml(handoff.recipientName || '—')}</p>` : ''}
      ${handoff.exceptionNote ? `<p class="text-sm text-amber-200">Exception: ${escapeHtml(handoff.exceptionNote)}</p>` : ''}<p id="pickupHandoffMessage" class="text-sm"></p>
    </section>`);

    async function pickupAction(action) {
      const message = $('#pickupHandoffMessage');
      try {
        await request('/.netlify/functions/admin-pickup-order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          sessionId: order.sessionId, expectedUpdatedAt: order.updatedAt, action,
          releasedBy: $('#pickupReleasedBy').value, recipientName: $('#pickupRecipientName').value, note: $('#pickupNote').value
        }) });
        closeDrawer();
        await Promise.all([loadAll(), typeof loadCampaignData === 'function' ? loadCampaignData() : Promise.resolve()]);
      } catch (error) { setMessage(message, error.message); }
    }
    $('#markPickedUp')?.addEventListener('click', () => pickupAction('picked_up'));
    $('#markPickupNoShow')?.addEventListener('click', () => pickupAction('no_show'));
    $('#markPickupException')?.addEventListener('click', () => pickupAction('exception'));
    $('#reversePickup')?.addEventListener('click', () => pickupAction('reverse_pickup'));
  }

  function installOrderOverride() {
    if (typeof ORDER_STATUSES_UI !== 'undefined' && !ORDER_STATUSES_UI.includes('ready_for_pickup')) ORDER_STATUSES_UI.splice(5, 0, 'ready_for_pickup');
    if (typeof ORDER_STATUSES_UI !== 'undefined' && !ORDER_STATUSES_UI.includes('picked_up')) ORDER_STATUSES_UI.push('picked_up');
    const originalOpenOrder = openOrder;
    openOrder = function openOrderWithPickup(sessionId) {
      const order = operationsData.orders.find((item) => item.sessionId === sessionId);
      originalOpenOrder(sessionId);
      installOrderPickupPanel(order);
    };
  }

  installCampaignPickupFields();
  installOverrides();
  installOrderOverride();
  $('#createCampaignBatch')?.addEventListener('click', buildPickupBatch, true);
  $('#exportPickupRoster')?.addEventListener('click', exportRoster);
  updateChurchBatchUI();
})();
