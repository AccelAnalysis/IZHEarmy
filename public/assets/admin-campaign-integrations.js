'use strict';
function installCampaignOperationFields() {
  if (!$('#batchCampaignId')) {
    const batchGrid = $('#batchName')?.closest('.grid');
    batchGrid?.insertAdjacentHTML('beforeend', '<label><span class="label">CAMPAIGN</span><select class="field" id="batchCampaignId"><option value="">General / mixed batch</option></select></label>');
  }
  if (!$('#giveCampaignId')) {
    $('#giveProductId')?.insertAdjacentHTML('beforebegin', '<select id="giveCampaignId" class="field" aria-label="Campaign"><option value="">No campaign attribution</option></select>');
    $('#createCodes')?.classList.remove('md:grid-cols-4');
    $('#createCodes')?.classList.add('md:grid-cols-5');
  }
}

function campaignOptionMarkup(selected = '') {
  return `<option value="">No campaign attribution</option>${campaignAdminData.campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id)}" ${campaign.id === selected ? 'selected' : ''}>${escapeHtml(campaign.organization)} — ${escapeHtml(campaign.title)}</option>`).join('')}`;
}

function batchCampaignOptionMarkup(selected = '') {
  return `<option value="">General / mixed batch</option>${campaignAdminData.campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id)}" ${campaign.id === selected ? 'selected' : ''}>${escapeHtml(campaign.organization)} — ${escapeHtml(campaign.title)}</option>`).join('')}`;
}

function campaignAllowsAdminProduct(campaign, product) {
  return (campaign.productIds || []).includes(product.id) || (campaign.collectionIds || []).includes(product.collectionId);
}

function populateCampaignOperationFields() {
  installCampaignOperationFields();
  const selectedBatch = $('#batchCampaignId')?.value || operationsData.batches.find((item) => item.id === activeBatchId)?.campaignId || '';
  const selectedGive = $('#giveCampaignId')?.value || '';
  if ($('#batchCampaignId')) $('#batchCampaignId').innerHTML = batchCampaignOptionMarkup(selectedBatch);
  if ($('#giveCampaignId')) $('#giveCampaignId').innerHTML = campaignOptionMarkup(selectedGive);
  filterGiveProductsForCampaign();
}

function filterGiveProductsForCampaign() {
  const select = $('#giveProductId');
  if (!select || !catalogData) return;
  const campaignId = $('#giveCampaignId')?.value || '';
  const campaign = campaignAdminData.campaigns.find((item) => item.id === campaignId);
  const products = catalogData.catalog.products.filter((product) => product.giveOneEligible && product.status !== 'archived' && (!campaign || campaignAllowsAdminProduct(campaign, product)));
  const previous = select.value;
  select.innerHTML = products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.shortName)} — ${escapeHtml(product.audienceLabel)}</option>`).join('');
  if (products.some((product) => product.id === previous)) select.value = previous;
}

installCampaignOperationFields();
const baseLoadCampaignDataWithOperations = loadCampaignData;
loadCampaignData = async function campaignOperationLoad() {
  await baseLoadCampaignDataWithOperations();
  populateCampaignOperationFields();
};

const baseFulfillmentItemsForCampaigns = fulfillmentItems;
fulfillmentItems = function campaignAttributedFulfillmentItems() {
  const selectedCampaign = $('#batchCampaignId')?.value || '';
  return baseFulfillmentItemsForCampaigns().map((item) => {
    const source = item.sourceType === 'redemption'
      ? operationsData.redemptions.find((record) => record.confirmation === item.sourceId)
      : operationsData.orders.find((record) => record.sessionId === item.sourceId);
    return { ...item, campaignId: source?.campaignId || '' };
  }).filter((item) => !selectedCampaign || item.campaignId === selectedCampaign);
};

const baseNewBatchForCampaigns = newBatch;
newBatch = function campaignAwareNewBatch() {
  baseNewBatchForCampaigns();
  if ($('#batchCampaignId')) $('#batchCampaignId').value = '';
};

const baseEditBatchForCampaigns = editBatch;
editBatch = function campaignAwareEditBatch(id) {
  baseEditBatchForCampaigns(id);
  const batch = operationsData.batches.find((item) => item.id === id);
  if ($('#batchCampaignId')) {
    $('#batchCampaignId').innerHTML = batchCampaignOptionMarkup(batch?.campaignId || '');
    $('#batchCampaignId').value = batch?.campaignId || '';
  }
  renderBatchPicker();
};

$('#batchCampaignId')?.addEventListener('change', () => {
  currentBatchItems = currentBatchItems.filter((item) => !$('#batchCampaignId').value || item.campaignId === $('#batchCampaignId').value);
  renderBatchPicker();
});
$('#giveCampaignId')?.addEventListener('change', filterGiveProductsForCampaign);

$('#batchForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
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
        campaignId: $('#batchCampaignId').value,
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
}, true);

$('#createCodes')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    const result = await request('/.netlify/functions/admin-create-codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      campaignId: $('#giveCampaignId').value,
      productId: $('#giveProductId').value,
      orderRef: $('#orderRef').value,
      count: Number($('#count').value)
    }) });
    alert(result.created.map((entry) => entry.code).join('\n'));
    await loadAll();
  } catch (error) { alert(error.message); }
}, true);
