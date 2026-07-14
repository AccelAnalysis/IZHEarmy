'use strict';
let campaignAdminData = { inquiries: [], campaigns: [], reports: [], alerts: [], summary: {}, catalog: { collections: [], products: [] } };
let activeCampaignId = '';

const CAMPAIGN_STATUSES_UI = ['planning', 'scheduled', 'active', 'closed', 'fulfilled', 'cancelled'];
const INQUIRY_STATUSES_UI = ['new', 'contacted', 'discovery_scheduled', 'plan_sent', 'confirmed', 'converted', 'completed', 'declined'];
const CAMPAIGN_PUBLISH_UI = ['draft', 'published', 'hidden', 'archived'];
const CAMPAIGN_TYPES_UI = ['church', 'conference', 'youth', 'outreach', 'ministry', 'event', 'other'];
const CAMPAIGN_FULFILLMENT_UI = ['individual_shipping', 'church_batch', 'hybrid'];

function campaignPill(status) {
  const colors = { active: 'bg-green-400/15 text-green-300', scheduled: 'bg-blue-400/15 text-blue-300', planning: 'bg-amber-400/15 text-amber-300', closed: 'bg-slate-400/15 text-slate-300', fulfilled: 'bg-purple-400/15 text-purple-300', cancelled: 'bg-red-400/15 text-red-300', new: 'bg-amber-400/15 text-amber-300', converted: 'bg-green-400/15 text-green-300' };
  return `<span class="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase ${colors[status] || 'bg-slate-400/15 text-slate-300'}">${escapeHtml(humanStatus(status))}</span>`;
}

function installCampaignUI() {
  if ($('#campaignList')) return;
  const ordersTab = $('[data-tab="orders"]') || $('[data-tab="collections"]');
  ordersTab?.insertAdjacentHTML('beforebegin', '<button data-tab="inquiries" class="whitespace-nowrap bg-slate-900 px-5 py-3 rounded-xl font-bold">CHURCH INQUIRIES <span id="inquiryBadge" class="ml-1 bg-amber-400 text-slate-950 rounded-full px-2 py-0.5 text-xs">0</span></button><button data-tab="campaigns" class="whitespace-nowrap bg-slate-900 px-5 py-3 rounded-xl font-bold">CAMPAIGNS</button><button data-tab="campaign-reports" class="whitespace-nowrap bg-slate-900 px-5 py-3 rounded-xl font-bold">CAMPAIGN REPORTS</button>');
  const ordersPanel = $('[data-tab-panel="orders"]') || $('[data-tab-panel="collections"]');
  ordersPanel?.insertAdjacentHTML('beforebegin', `<section data-tab-panel="inquiries" hidden>
    <div class="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6"><div class="card p-5"><p class="text-slate-400">All inquiries</p><strong id="inquiryCount" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">Open inquiries</p><strong id="openInquiryCount" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">New</p><strong id="newInquiryCount" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">Confirmed</p><strong id="confirmedInquiryCount" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">Campaign alerts</p><strong id="campaignAlertCount" class="text-3xl">0</strong></div></div>
    <div class="card p-5 mb-5"><div class="grid md:grid-cols-3 gap-3"><input id="inquirySearch" class="field" placeholder="Search church, contact, email, objective, or timeframe"><select id="inquiryStatusFilter" class="field"><option value="">All statuses</option>${INQUIRY_STATUSES_UI.map((value) => `<option value="${value}">${humanStatus(value)}</option>`).join('')}</select><button id="refreshCampaigns" type="button" class="bg-white text-slate-950 rounded-xl font-bold">REFRESH CAMPAIGN DATA</button></div></div>
    <div class="card overflow-auto max-h-[720px]"><table class="w-full text-sm min-w-[1350px]"><thead class="table-head"><tr class="text-left border-b border-white/10"><th class="p-4">Inquiry</th><th class="p-4">Church / Ministry</th><th class="p-4">Contact</th><th class="p-4">Timeframe</th><th class="p-4">Ministry objective</th><th class="p-4">Assigned / Follow-up</th><th class="p-4">Status</th><th class="p-4">Action</th></tr></thead><tbody id="inquiryTable"></tbody></table></div>
  </section>
  <section data-tab-panel="campaigns" hidden>
    <div class="grid xl:grid-cols-[430px_1fr] gap-6"><div class="card overflow-hidden"><div class="p-5 border-b border-white/10 flex justify-between items-center"><div><h2 class="text-xl font-bold">Church campaigns</h2><p class="text-xs text-slate-400 mt-1">Configure the campaign, landing page, products, support model, and fulfillment.</p></div><button id="newCampaign" class="bg-amber-400 text-slate-950 px-3 py-2 rounded-lg font-bold">NEW</button></div><div class="p-4 grid grid-cols-2 gap-3 border-b border-white/10"><input id="campaignSearch" class="field" placeholder="Search campaigns"><select id="campaignStatusFilter" class="field"><option value="">All statuses</option>${CAMPAIGN_STATUSES_UI.map((value) => `<option value="${value}">${humanStatus(value)}</option>`).join('')}</select></div><div id="campaignList" class="divide-y divide-white/5 max-h-[820px] overflow-y-auto"></div></div>
    <form id="campaignForm" class="card p-6 space-y-6"><div class="flex flex-wrap justify-between gap-4"><div><h2 id="campaignFormTitle" class="text-2xl font-bold">New campaign</h2><p class="text-slate-400 text-sm mt-1">Published campaigns receive a dedicated URL and downloadable QR code.</p></div><div class="flex flex-wrap gap-3"><button id="openCampaignPage" type="button" class="border border-white/15 px-4 py-3 rounded-xl font-bold hidden">OPEN PAGE</button><button id="downloadCampaignQrAdmin" type="button" class="border border-white/15 px-4 py-3 rounded-xl font-bold hidden">DOWNLOAD QR</button><button class="bg-amber-400 text-slate-950 px-6 py-3 rounded-xl font-extrabold">SAVE CAMPAIGN</button></div></div>
    <input id="campaignId" type="hidden"><input id="campaignExpectedUpdatedAt" type="hidden"><input id="campaignInquiryId" type="hidden">
    <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-4"><label><span class="label">CAMPAIGN TITLE</span><input id="campaignTitle" class="field" required></label><label><span class="label">URL SLUG</span><input id="campaignSlug" class="field" required></label><label><span class="label">ORGANIZATION</span><input id="campaignOrganization" class="field" required></label><label><span class="label">CAMPAIGN TYPE</span><select id="campaignType" class="field">${CAMPAIGN_TYPES_UI.map((value) => `<option value="${value}">${humanStatus(value)}</option>`).join('')}</select></label></div>
    <div class="grid md:grid-cols-3 gap-4"><label><span class="label">CONTACT NAME</span><input id="campaignContactName" class="field"></label><label><span class="label">CONTACT EMAIL</span><input id="campaignContactEmail" type="email" class="field"></label><label><span class="label">CONTACT PHONE</span><input id="campaignContactPhone" class="field"></label></div>
    <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-4"><label><span class="label">CAMPAIGN STATUS</span><select id="campaignStatus" class="field">${CAMPAIGN_STATUSES_UI.map((value) => `<option value="${value}">${humanStatus(value)}</option>`).join('')}</select></label><label><span class="label">PAGE STATUS</span><select id="campaignPublishStatus" class="field">${CAMPAIGN_PUBLISH_UI.map((value) => `<option value="${value}">${humanStatus(value)}</option>`).join('')}</select></label><label><span class="label">FULFILLMENT METHOD</span><select id="campaignFulfillmentMethod" class="field">${CAMPAIGN_FULFILLMENT_UI.map((value) => `<option value="${value}">${humanStatus(value)}</option>`).join('')}</select></label><label><span class="label">PRESENTATION DATE</span><input id="campaignPresentationAt" type="datetime-local" class="field"></label></div>
    <div class="grid md:grid-cols-2 gap-4"><label><span class="label">ORDERING START</span><input id="campaignStartAt" type="datetime-local" class="field"></label><label><span class="label">ORDERING END</span><input id="campaignEndAt" type="datetime-local" class="field"></label></div>
    <label><span class="label">MINISTRY OBJECTIVE</span><textarea id="campaignObjective" class="field" rows="4" required></textarea></label>
    <div class="grid md:grid-cols-2 gap-4"><label><span class="label">PUBLIC HEADLINE</span><input id="campaignHeadline" class="field"></label><label><span class="label">CALL TO ACTION</span><input id="campaignCallToAction" class="field"></label></div>
    <label><span class="label">PUBLIC CAMPAIGN DESCRIPTION</span><textarea id="campaignDescription" class="field" rows="4"></textarea></label><label><span class="label">HERO IMAGE URL</span><input id="campaignHeroImage" type="url" class="field"></label>
    <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-4"><label><span class="label">GOAL — UNITS</span><input id="campaignGoalUnits" type="number" min="0" class="field"></label><label><span class="label">GOAL — DOLLARS</span><input id="campaignGoalAmount" type="number" min="0" step=".01" class="field"></label><label><span class="label">SUPPORT MODEL</span><select id="campaignSupportModel" class="field"><option value="percentage">Percentage of campaign sales</option><option value="per_unit">Fixed amount per unit</option><option value="fixed">Fixed campaign amount</option></select></label><label><span class="label">SUPPORT RATE</span><input id="campaignSupportRate" type="number" min="0" step=".01" class="field"><span id="supportRateHelp" class="text-xs text-slate-500 block mt-1"></span></label></div>
    <label><span class="label">SUPPORT REPORT LABEL</span><input id="campaignSupportLabel" class="field" value="Ministry support generated"></label>
    <div class="grid lg:grid-cols-2 gap-5"><div class="border border-white/10 rounded-2xl p-5"><h3 class="font-bold text-lg">Campaign collections</h3><p class="text-sm text-slate-400 mt-1">Selecting a collection makes its published products eligible unless individual products are used instead.</p><div id="campaignCollections" class="space-y-2 mt-4"></div></div><div class="border border-white/10 rounded-2xl p-5"><div class="flex justify-between items-center gap-3"><div><h3 class="font-bold text-lg">Campaign products</h3><p class="text-sm text-slate-400 mt-1">Choose individual products for a focused campaign assortment.</p></div><input id="campaignProductSearch" class="field max-w-xs" placeholder="Search products"></div><div id="campaignProducts" class="space-y-2 mt-4 max-h-72 overflow-y-auto"></div></div></div>
    <label><span class="label">FULFILLMENT NOTES</span><textarea id="campaignFulfillmentNotes" class="field" rows="3"></textarea></label><label><span class="label">INTERNAL CAMPAIGN NOTES</span><textarea id="campaignNotes" class="field" rows="3"></textarea></label>
    <div id="campaignActions" class="hidden border-t border-white/10 pt-5"><div class="flex flex-wrap gap-3"><button id="createCampaignBatch" type="button" class="bg-white text-slate-950 px-5 py-3 rounded-xl font-bold">CREATE FULFILLMENT BATCH</button><button id="copyCampaignLinkAdmin" type="button" class="border border-white/15 px-5 py-3 rounded-xl font-bold">COPY CAMPAIGN LINK</button></div></div><p id="campaignStatusMessage" class="text-sm"></p></form></div>
  </section>
  <section data-tab-panel="campaign-reports" hidden><div class="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6"><div class="card p-5"><p class="text-slate-400">Campaigns</p><strong id="reportCampaignCount" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">Active</p><strong id="reportActiveCount" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">Campaign sales</p><strong id="reportRevenue" class="text-3xl">$0.00</strong></div><div class="card p-5"><p class="text-slate-400">Units</p><strong id="reportUnits" class="text-3xl">0</strong></div><div class="card p-5"><p class="text-slate-400">Ministry support</p><strong id="reportSupport" class="text-3xl">$0.00</strong></div></div><div class="flex flex-wrap justify-between gap-4 mb-5"><div><h2 class="text-3xl font-bold">Campaign performance</h2><p class="text-slate-400 mt-2">Sales, Give One participation, fulfillment, batches, and calculated ministry support.</p></div><button id="exportCampaignReports" class="bg-white text-slate-950 px-5 py-3 rounded-xl font-bold">EXPORT REPORT</button></div><div id="campaignAlerts" class="space-y-3 mb-6"></div><div class="card overflow-auto max-h-[760px]"><table class="w-full text-sm min-w-[1600px]"><thead class="table-head"><tr class="text-left border-b border-white/10"><th class="p-4">Campaign</th><th class="p-4">Status</th><th class="p-4">Orders</th><th class="p-4">Revenue</th><th class="p-4">Units</th><th class="p-4">Codes</th><th class="p-4">Claim rate</th><th class="p-4">Gift fulfillment</th><th class="p-4">Batches</th><th class="p-4">Ministry support</th><th class="p-4">Goals</th><th class="p-4">Action</th></tr></thead><tbody id="campaignReportTable"></tbody></table></div></section>`);
  const headerCopy = document.querySelector('header p');
  if (headerCopy) headerCopy.textContent = 'Catalog, church campaigns, orders, Give One, fulfillment, production, and reports';
}

function campaignStatusOptions(values, selected) {
  return values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${humanStatus(value)}</option>`).join('');
}

function campaignLink(campaign) {
  return `${location.origin}/campaign/${encodeURIComponent(campaign.slug)}`;
}

function renderCampaignAdmin() {
  renderInquiryTable();
  renderCampaignList();
  renderCampaignReports();
  $('#inquiryBadge').textContent = campaignAdminData.summary.openInquiryCount || 0;
  if (activeCampaignId) editCampaign(activeCampaignId);
}

function filteredInquiries() {
  const query = ($('#inquirySearch')?.value || '').trim().toLowerCase();
  const status = $('#inquiryStatusFilter')?.value || '';
  return campaignAdminData.inquiries.filter((item) => (!status || item.status === status) && (!query || recordSearchText(item).includes(query)));
}

function renderInquiryTable() {
  const records = filteredInquiries();
  const summary = campaignAdminData.summary || {};
  $('#inquiryCount').textContent = summary.inquiryCount || 0;
  $('#openInquiryCount').textContent = summary.openInquiryCount || 0;
  $('#newInquiryCount').textContent = campaignAdminData.inquiries.filter((item) => item.status === 'new').length;
  $('#confirmedInquiryCount').textContent = campaignAdminData.inquiries.filter((item) => item.status === 'confirmed').length;
  $('#campaignAlertCount').textContent = campaignAdminData.alerts.length;
  $('#inquiryTable').innerHTML = records.map((item) => `<tr class="border-b border-white/5 align-top"><td class="p-4 font-mono text-xs">${escapeHtml(item.id)}<p class="text-slate-500 mt-1">${formatDate(item.createdAt)}</p></td><td class="p-4"><strong>${escapeHtml(item.organization)}</strong><p class="text-slate-400 mt-1">${escapeHtml(item.attendance || 'Attendance not provided')}</p></td><td class="p-4">${escapeHtml(item.contactName)}<p class="text-slate-400">${escapeHtml(item.email)}</p><p class="text-slate-500">${escapeHtml(item.phone || '')}</p></td><td class="p-4">${escapeHtml(item.timeframe || item.preferredDate || 'Not specified')}</td><td class="p-4 max-w-sm">${escapeHtml(item.ministryObjective || '—')}</td><td class="p-4">${escapeHtml(item.assignedTo || 'Unassigned')}<p class="text-slate-400 mt-1">${item.followUpAt ? formatDate(item.followUpAt) : 'No follow-up set'}</p></td><td class="p-4">${campaignPill(item.status)}</td><td class="p-4"><button data-view-inquiry="${escapeHtml(item.id)}" class="text-amber-400 font-bold">VIEW / UPDATE</button></td></tr>`).join('') || '<tr><td colspan="8" class="p-8 text-center text-slate-400">No inquiries match the filters.</td></tr>';
  $$('[data-view-inquiry]').forEach((button) => button.addEventListener('click', () => openInquiry(button.dataset.viewInquiry)));
}

function openInquiry(id) {
  const inquiry = campaignAdminData.inquiries.find((item) => item.id === id);
  if (!inquiry) return;
  openDrawer('Church inquiry', id, `<form id="inquiryUpdateForm" class="space-y-5"><div class="card p-4"><span class="label">CHURCH / MINISTRY</span><strong class="text-xl">${escapeHtml(inquiry.organization)}</strong><p class="text-slate-400 mt-1">${escapeHtml(inquiry.contactName)} · ${escapeHtml(inquiry.email)} · ${escapeHtml(inquiry.phone || '')}</p></div><div><span class="label">MINISTRY OBJECTIVE</span><p class="border border-white/10 rounded-xl p-4">${escapeHtml(inquiry.ministryObjective || '—')}</p></div><div class="grid sm:grid-cols-2 gap-4"><label><span class="label">STATUS</span><select id="drawerInquiryStatus" class="field">${campaignStatusOptions(INQUIRY_STATUSES_UI, inquiry.status)}</select></label><label><span class="label">ASSIGNED TO</span><input id="drawerInquiryAssigned" class="field" value="${escapeHtml(inquiry.assignedTo || '')}"></label></div><label><span class="label">FOLLOW-UP DATE</span><input id="drawerInquiryFollowUp" type="datetime-local" class="field" value="${toLocalInput(inquiry.followUpAt)}"></label><label><span class="label">NOTES</span><textarea id="drawerInquiryNotes" class="field" rows="5">${escapeHtml(inquiry.notes || '')}</textarea></label><div class="grid sm:grid-cols-2 gap-3"><button class="bg-amber-400 text-slate-950 rounded-xl py-3 font-extrabold">SAVE INQUIRY</button><button id="convertInquiry" type="button" class="bg-white text-slate-950 rounded-xl py-3 font-extrabold">CREATE CAMPAIGN</button></div><p id="drawerInquiryMessage" class="text-sm"></p></form>`);
  $('#inquiryUpdateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/.netlify/functions/admin-update-inquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: inquiry.updatedAt, inquiry: { ...inquiry, status: $('#drawerInquiryStatus').value, assignedTo: $('#drawerInquiryAssigned').value, followUpAt: toIso($('#drawerInquiryFollowUp').value), notes: $('#drawerInquiryNotes').value } }) });
      closeDrawer();
      await loadCampaignData();
    } catch (error) { setMessage($('#drawerInquiryMessage'), error.message); }
  });
  $('#convertInquiry').addEventListener('click', () => { closeDrawer(); showTab('campaigns'); newCampaign(inquiry); });
}

function renderCampaignList() {
  const query = ($('#campaignSearch')?.value || '').trim().toLowerCase();
  const status = $('#campaignStatusFilter')?.value || '';
  const campaigns = campaignAdminData.campaigns.filter((item) => (!status || item.status === status) && (!query || recordSearchText(item).includes(query)));
  $('#campaignList').innerHTML = campaigns.map((campaign) => { const report = campaignAdminData.reports.find((item) => item.campaignId === campaign.id); return `<button type="button" data-edit-campaign="${escapeHtml(campaign.id)}" class="w-full text-left p-5 hover:bg-white/5 ${activeCampaignId === campaign.id ? 'bg-white/5' : ''}"><div class="flex justify-between gap-4"><div class="min-w-0"><h3 class="font-bold truncate">${escapeHtml(campaign.title)}</h3><p class="text-sm text-slate-400 truncate mt-1">${escapeHtml(campaign.organization)}</p><p class="text-xs text-slate-500 mt-2">${report?.soldUnits || 0} units · ${money(report?.revenue || 0)} sales · ${money(report?.supportAmount || 0)} support</p></div><div class="text-right flex-none">${campaignPill(campaign.status)}<p class="text-xs text-slate-500 mt-2">${escapeHtml(campaign.publishStatus)}</p></div></div></button>`; }).join('') || '<p class="p-6 text-slate-400">No campaigns match the filters.</p>';
  $$('[data-edit-campaign]').forEach((button) => button.addEventListener('click', () => editCampaign(button.dataset.editCampaign)));
}

function renderCampaignSelections(selectedCollections = [], selectedProducts = []) {
  const collections = new Set(selectedCollections);
  const products = new Set(selectedProducts);
  $('#campaignCollections').innerHTML = campaignAdminData.catalog.collections.map((collection) => `<label class="flex items-start gap-3 border border-white/10 rounded-xl p-3"><input type="checkbox" data-campaign-collection="${escapeHtml(collection.id)}" class="mt-1 w-5 h-5 accent-amber-400" ${collections.has(collection.id) ? 'checked' : ''}><span><strong>${escapeHtml(collection.shortTitle)}</strong><span class="block text-xs text-slate-400">${escapeHtml(collection.title)}</span></span></label>`).join('');
  const query = ($('#campaignProductSearch')?.value || '').trim().toLowerCase();
  $('#campaignProducts').innerHTML = campaignAdminData.catalog.products.filter((product) => !query || recordSearchText(product).includes(query)).map((product) => `<label class="flex items-start gap-3 border border-white/10 rounded-xl p-3"><input type="checkbox" data-campaign-product="${escapeHtml(product.id)}" class="mt-1 w-5 h-5 accent-amber-400" ${products.has(product.id) ? 'checked' : ''}><span><strong>${escapeHtml(product.shortName || product.name)}</strong><span class="block text-xs text-slate-400">${escapeHtml(product.audienceLabel || product.productType)} · ${escapeHtml(product.status)} / ${escapeHtml(product.availabilityStatus)}</span></span></label>`).join('');
}

function updateSupportHelp() {
  const model = $('#campaignSupportModel').value;
  $('#supportRateHelp').textContent = model === 'percentage' ? 'Enter a percentage, such as 10 for 10%.' : model === 'per_unit' ? 'Enter dollars contributed per unit.' : 'Enter the fixed campaign support amount in dollars.';
}

function newCampaign(inquiry = null) {
  activeCampaignId = '';
  $('#campaignForm').reset();
  $('#campaignId').value = '';
  $('#campaignExpectedUpdatedAt').value = '';
  $('#campaignInquiryId').value = inquiry?.id || '';
  $('#campaignTitle').value = inquiry ? `${inquiry.organization} IZHE Campaign` : '';
  $('#campaignOrganization').value = inquiry?.organization || '';
  $('#campaignContactName').value = inquiry?.contactName || '';
  $('#campaignContactEmail').value = inquiry?.email || '';
  $('#campaignContactPhone').value = inquiry?.phone || '';
  $('#campaignObjective').value = inquiry?.ministryObjective || '';
  $('#campaignStatus').value = 'planning';
  $('#campaignPublishStatus').value = 'draft';
  $('#campaignFulfillmentMethod').value = 'individual_shipping';
  $('#campaignSupportModel').value = 'percentage';
  $('#campaignSupportRate').value = '0';
  $('#campaignSupportLabel').value = 'Ministry support generated';
  $('#campaignFormTitle').textContent = inquiry ? `Create campaign for ${inquiry.organization}` : 'New campaign';
  $('#campaignActions').classList.add('hidden');
  $('#openCampaignPage').classList.add('hidden');
  $('#downloadCampaignQrAdmin').classList.add('hidden');
  renderCampaignSelections([], []);
  updateSupportHelp();
  renderCampaignList();
}

function editCampaign(id) {
  const campaign = campaignAdminData.campaigns.find((item) => item.id === id);
  if (!campaign) return;
  activeCampaignId = id;
  $('#campaignId').value = campaign.id;
  $('#campaignExpectedUpdatedAt').value = campaign.updatedAt || '';
  $('#campaignInquiryId').value = campaign.inquiryId || '';
  $('#campaignTitle').value = campaign.title || '';
  $('#campaignSlug').value = campaign.slug || '';
  $('#campaignOrganization').value = campaign.organization || '';
  $('#campaignType').value = campaign.campaignType || 'church';
  $('#campaignContactName').value = campaign.contactName || '';
  $('#campaignContactEmail').value = campaign.contactEmail || '';
  $('#campaignContactPhone').value = campaign.contactPhone || '';
  $('#campaignStatus').value = campaign.status || 'planning';
  $('#campaignPublishStatus').value = campaign.publishStatus || 'draft';
  $('#campaignFulfillmentMethod').value = campaign.fulfillmentMethod || 'individual_shipping';
  $('#campaignPresentationAt').value = toLocalInput(campaign.presentationAt);
  $('#campaignStartAt').value = toLocalInput(campaign.startAt);
  $('#campaignEndAt').value = toLocalInput(campaign.endAt);
  $('#campaignObjective').value = campaign.ministryObjective || '';
  $('#campaignHeadline').value = campaign.publicHeadline || '';
  $('#campaignCallToAction').value = campaign.callToAction || '';
  $('#campaignDescription').value = campaign.publicDescription || '';
  $('#campaignHeroImage').value = campaign.heroImage || '';
  $('#campaignGoalUnits').value = campaign.goalUnits || 0;
  $('#campaignGoalAmount').value = Number(campaign.goalAmount || 0) / 100;
  $('#campaignSupportModel').value = campaign.supportModel || 'percentage';
  $('#campaignSupportRate').value = campaign.supportModel === 'percentage' ? campaign.supportRate || 0 : Number(campaign.supportRate || 0) / 100;
  $('#campaignSupportLabel').value = campaign.supportLabel || 'Ministry support generated';
  $('#campaignFulfillmentNotes').value = campaign.fulfillmentNotes || '';
  $('#campaignNotes').value = campaign.notes || '';
  $('#campaignFormTitle').textContent = `Edit ${campaign.title}`;
  $('#campaignActions').classList.remove('hidden');
  $('#openCampaignPage').classList.toggle('hidden', campaign.publishStatus !== 'published');
  $('#downloadCampaignQrAdmin').classList.toggle('hidden', campaign.publishStatus !== 'published');
  renderCampaignSelections(campaign.collectionIds || [], campaign.productIds || []);
  updateSupportHelp();
  renderCampaignList();
}

function selectedCampaignIds(selector) {
  return $$(`${selector}:checked`).map((input) => input.dataset.campaignCollection || input.dataset.campaignProduct).filter(Boolean);
}

function collectCampaign() {
  const supportModel = $('#campaignSupportModel').value;
  const supportInput = Number($('#campaignSupportRate').value || 0);
  return {
    id: $('#campaignId').value,
    inquiryId: $('#campaignInquiryId').value,
    title: $('#campaignTitle').value,
    slug: $('#campaignSlug').value,
    organization: $('#campaignOrganization').value,
    campaignType: $('#campaignType').value,
    contactName: $('#campaignContactName').value,
    contactEmail: $('#campaignContactEmail').value,
    contactPhone: $('#campaignContactPhone').value,
    status: $('#campaignStatus').value,
    publishStatus: $('#campaignPublishStatus').value,
    fulfillmentMethod: $('#campaignFulfillmentMethod').value,
    presentationAt: toIso($('#campaignPresentationAt').value),
    startAt: toIso($('#campaignStartAt').value),
    endAt: toIso($('#campaignEndAt').value),
    ministryObjective: $('#campaignObjective').value,
    publicHeadline: $('#campaignHeadline').value,
    callToAction: $('#campaignCallToAction').value,
    publicDescription: $('#campaignDescription').value,
    heroImage: $('#campaignHeroImage').value,
    goalUnits: Number($('#campaignGoalUnits').value || 0),
    goalAmount: Math.round(Number($('#campaignGoalAmount').value || 0) * 100),
    supportModel,
    supportRate: supportModel === 'percentage' ? supportInput : Math.round(supportInput * 100),
    supportLabel: $('#campaignSupportLabel').value,
    collectionIds: selectedCampaignIds('[data-campaign-collection]'),
    productIds: selectedCampaignIds('[data-campaign-product]'),
    fulfillmentNotes: $('#campaignFulfillmentNotes').value,
    notes: $('#campaignNotes').value
  };
}

function campaignBatchItems(campaignId) {
  const assigned = new Set(operationsData.batches.filter((batch) => batch.status !== 'cancelled').flatMap((batch) => (batch.items || []).map((item) => item.sourceItemId)));
  const orderTerminal = new Set(['completed', 'cancelled', 'refunded_or_disputed']);
  const redemptionTerminal = new Set(['fulfilled', 'cancelled']);
  const items = [];
  operationsData.orders.filter((order) => order.campaignId === campaignId && !orderTerminal.has(order.status)).forEach((order) => (order.items || []).forEach((item, index) => {
    const sourceItemId = `${order.sessionId}:item:${index}`;
    if (assigned.has(sourceItemId)) return;
    items.push({ sourceType: 'order', sourceId: order.sessionId, sourceItemId, itemIndex: index, productId: item.productId, productName: item.productName || item.shortName, variantId: item.variantId, fit: item.fit, size: item.size, color: item.color, sku: item.sku, variantSku: item.variantSku, campaignId, quantity: Number(item.quantity || 1) });
  }));
  operationsData.redemptions.filter((item) => item.campaignId === campaignId && !redemptionTerminal.has(item.status)).forEach((item) => {
    const sourceItemId = `${item.confirmation}:redemption`;
    if (assigned.has(sourceItemId)) return;
    items.push({ sourceType: 'redemption', sourceId: item.confirmation, sourceItemId, itemIndex: null, productId: item.productId, productName: item.productName, variantId: item.variantId, fit: item.fit, size: item.size, color: item.color, variantSku: item.variantSku, campaignId, quantity: 1 });
  });
  return items;
}

async function createCampaignBatch() {
  const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId);
  if (!campaign) return;
  const items = campaignBatchItems(campaign.id);
  if (!items.length) return alert('There are no unassigned campaign fulfillment units available for a new batch.');
  if (!confirm(`Create a production batch containing ${items.reduce((sum, item) => sum + item.quantity, 0)} units for ${campaign.title}?`)) return;
  const result = await request('/.netlify/functions/admin-save-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ batch: { name: `${campaign.organization} — ${new Date().toLocaleDateString()} Campaign Batch`, campaignId: campaign.id, status: 'ready', notes: campaign.fulfillmentNotes || '', items } }) });
  activeBatchId = result.batch.id;
  await loadAll();
  showTab('batches');
  editBatch(activeBatchId);
}

function renderCampaignReports() {
  const summary = campaignAdminData.summary || {};
  $('#reportCampaignCount').textContent = summary.campaignCount || 0;
  $('#reportActiveCount').textContent = summary.activeCampaignCount || 0;
  $('#reportRevenue').textContent = money(summary.totalCampaignRevenue || 0);
  $('#reportUnits').textContent = summary.totalCampaignUnits || 0;
  $('#reportSupport').textContent = money(summary.totalMinistrySupport || 0);
  $('#campaignAlerts').innerHTML = campaignAdminData.alerts.length ? campaignAdminData.alerts.map((alert) => `<article class="border rounded-xl p-4 ${alert.severity === 'critical' ? 'border-red-500/40 bg-red-500/10 text-red-200' : alert.severity === 'warning' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-sky-400/30 bg-sky-400/10 text-sky-100'}"><strong>${escapeHtml(alert.type.toUpperCase())} · ${escapeHtml(alert.recordId)}</strong><p class="text-sm mt-1">${escapeHtml(alert.message)}</p></article>`).join('') : '<div class="border border-green-400/20 bg-green-400/5 rounded-xl p-4 text-green-300">No campaign alerts require attention.</div>';
  $('#campaignReportTable').innerHTML = campaignAdminData.reports.map((report) => { const campaign = report.campaign; return `<tr class="border-b border-white/5"><td class="p-4"><strong>${escapeHtml(campaign.title)}</strong><p class="text-slate-400">${escapeHtml(campaign.organization)}</p></td><td class="p-4">${campaignPill(campaign.status)}</td><td class="p-4">${report.orderCount}</td><td class="p-4">${money(report.revenue)}</td><td class="p-4">${report.soldUnits}</td><td class="p-4">${report.redeemedCodeCount} / ${report.codeCount}</td><td class="p-4">${report.claimRate}%</td><td class="p-4">${report.redemptionCount} total<br><span class="text-slate-400">${report.pendingFulfillmentCount} open</span></td><td class="p-4">${report.batchCount} total<br><span class="text-slate-400">${report.openBatchCount} open</span></td><td class="p-4 font-bold">${money(report.supportAmount)}</td><td class="p-4">${report.unitProgress == null ? '—' : `${report.unitProgress}% units`}<br>${report.revenueProgress == null ? '' : `${report.revenueProgress}% revenue`}</td><td class="p-4"><button data-report-campaign="${escapeHtml(campaign.id)}" class="text-amber-400 font-bold">OPEN CAMPAIGN</button></td></tr>`; }).join('') || '<tr><td colspan="12" class="p-8 text-center text-slate-400">No campaign reports are available.</td></tr>';
  $$('[data-report-campaign]').forEach((button) => button.addEventListener('click', () => { showTab('campaigns'); editCampaign(button.dataset.reportCampaign); }));
}

async function loadCampaignData() {
  campaignAdminData = await request('/.netlify/functions/admin-campaign-data');
  renderCampaignAdmin();
}

installCampaignUI();
const priority2LoadAll = loadAll;
loadAll = async function campaignAwareLoadAll() {
  await priority2LoadAll();
  if ($('#dashboard').classList.contains('hidden')) return;
  try { await loadCampaignData(); } catch (error) { console.error(error); }
};

$('#newCampaign').addEventListener('click', () => newCampaign());
$('#campaignSearch').addEventListener('input', renderCampaignList);
$('#campaignStatusFilter').addEventListener('change', renderCampaignList);
$('#inquirySearch').addEventListener('input', renderInquiryTable);
$('#inquiryStatusFilter').addEventListener('change', renderInquiryTable);
$('#refreshCampaigns').addEventListener('click', loadCampaignData);
$('#campaignProductSearch').addEventListener('input', () => { const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId); renderCampaignSelections(campaign?.collectionIds || selectedCampaignIds('[data-campaign-collection]'), campaign?.productIds || selectedCampaignIds('[data-campaign-product]')); });
$('#campaignSupportModel').addEventListener('change', updateSupportHelp);
$('#campaignTitle').addEventListener('input', () => { if (!$('#campaignId').value && (!$('#campaignSlug').value || $('#campaignSlug').dataset.auto === '1')) { $('#campaignSlug').value = slug($('#campaignTitle').value); $('#campaignSlug').dataset.auto = '1'; } });
$('#campaignForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#campaignStatusMessage');
  message.textContent = 'Saving campaign…';
  message.className = 'text-sm text-slate-400';
  try {
    const result = await request('/.netlify/functions/admin-save-campaign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: $('#campaignExpectedUpdatedAt').value, campaign: collectCampaign() }) });
    activeCampaignId = result.campaign.id;
    await loadCampaignData();
    editCampaign(activeCampaignId);
    setMessage(message, 'Campaign saved. Its products, landing page, QR link, and reports now use this campaign record.', true);
  } catch (error) { setMessage(message, error.message); }
});
$('#openCampaignPage').addEventListener('click', () => { const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId); if (campaign) window.open(campaignLink(campaign), '_blank', 'noopener'); });
$('#downloadCampaignQrAdmin').addEventListener('click', () => { const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId); if (campaign) location.href = `/.netlify/functions/campaign-qr?slug=${encodeURIComponent(campaign.slug)}&download=1`; });
$('#copyCampaignLinkAdmin').addEventListener('click', async () => { const campaign = campaignAdminData.campaigns.find((item) => item.id === activeCampaignId); if (campaign) { await navigator.clipboard.writeText(campaignLink(campaign)); alert('Campaign link copied.'); } });
$('#createCampaignBatch').addEventListener('click', () => createCampaignBatch().catch((error) => alert(error.message)));
$('#exportCampaignReports').addEventListener('click', async () => { const response = await fetch('/.netlify/functions/admin-campaign-report', { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) return alert('Campaign report could not be generated.'); const blob = await response.blob(); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = 'izhe-campaign-report.csv'; anchor.click(); URL.revokeObjectURL(anchor.href); });
