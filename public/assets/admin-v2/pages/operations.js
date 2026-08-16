import { api, downloadFromApi, functionUrl } from '../api.js';
import { can } from '../permissions.js';
import { button, debounce, definitionList, el, formatDate, formatMoney, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog, createDialog } from '../ui/dialog.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, filterChip, jsonDetails, openDrawer, pageHeader } from './page-utils.js';

const CONFIG = Object.freeze({
  orders: {
    title: 'Orders',
    description: 'Paid-order review, operational status, exceptions, and on-demand customer detail. Church pickup remains a distinct fulfillment mode.',
    resource: 'orders',
    permission: 'operations.orders.read',
    writePermission: 'operations.orders.write',
    exportPermission: 'operations.orders.export',
    exportType: 'orders',
    searchPlaceholder: 'Search orders…',
    statuses: ['paid', 'processing', 'allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'exception', 'cancelled', 'refunded']
  },
  'give-one': {
    title: 'Give One',
    description: 'Claim-code lifecycle and gift fulfillment, with full values revealed only in authorized detail views.',
    resource: 'give-one-codes',
    permission: 'operations.give_one.read',
    writePermission: 'operations.give_one.write',
    exportPermission: 'operations.give_one.export',
    exportType: 'codes',
    searchPlaceholder: 'Search Give One codes…',
    statuses: ['active', 'redeemed', 'expired', 'cancelled', 'reissued']
  },
  fulfillment: {
    title: 'Fulfillment',
    description: 'Shipping and fulfillment queue across paid orders. Church-pickup handoff remains in its dedicated workspace.',
    resource: 'fulfillment',
    permission: 'operations.fulfillment.read',
    writePermission: 'operations.fulfillment.write',
    exportPermission: 'operations.orders.export',
    exportType: 'orders',
    searchPlaceholder: 'Search fulfillment…',
    statuses: ['pending', 'allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'exception', 'cancelled']
  },
  batches: {
    title: 'Production Batches',
    description: 'Manual and campaign batch preparation, vendor handoff, receipt, completion, and production summaries.',
    resource: 'batches',
    permission: 'operations.batches.read',
    writePermission: 'operations.batches.write',
    exportPermission: 'operations.batches.export',
    exportType: 'batches',
    searchPlaceholder: 'Search production batches…',
    statuses: ['draft', 'ready', 'submitted', 'in_production', 'shipped_to_church', 'received', 'completed', 'cancelled']
  },
  pickup: {
    title: 'Church Pickup',
    description: 'Campaign pickup queue, masked lookup, authorized handoff, reversal, exceptions, and audited roster exports.',
    resource: 'pickup',
    permission: 'operations.pickup.read',
    writePermission: 'operations.pickup.write',
    exportPermission: 'operations.pickup.export',
    exportType: 'pickup',
    searchPlaceholder: 'Search by pickup code, order, or recipient…',
    statuses: ['awaiting_batch', 'allocated', 'in_production', 'ready_for_pickup', 'picked_up', 'exception', 'no_show', 'cancelled']
  }
});

function itemTitle(item, resource) {
  if (resource === 'batches') return item.batchNumber || item.id;
  if (resource === 'give-one-codes') return item.code || item.id;
  return item.orderNumber || item.id;
}

function detailFields(resource) {
  if (resource === 'give-one-codes') return [
    { label: 'Code', value: 'code' }, { label: 'Status', value: (record) => record.effectiveStatus || record.status },
    { label: 'Product', value: (record) => record.productName || record.productId }, { label: 'Campaign', value: 'campaignId' },
    { label: 'Source order', value: 'sourceSessionId' }, { label: 'Created', value: 'createdAt', format: formatDate },
    { label: 'Expires', value: 'expiresAt', format: formatDate }, { label: 'Redeemed', value: 'redeemedAt', format: formatDate }
  ];
  if (resource === 'batches') return [
    { label: 'Batch ID', value: 'id' }, { label: 'Name', value: 'name' }, { label: 'Type', value: 'batchType' },
    { label: 'Status', value: 'status' }, { label: 'Campaign', value: 'campaignId' }, { label: 'Vendor', value: 'vendor' },
    { label: 'Units', value: 'itemCount' }, { label: 'Due', value: 'dueDate', format: formatDate },
    { label: 'Updated', value: 'updatedAt', format: formatDate }
  ];
  return [
    { label: 'Order reference', value: (record) => record.sessionId || record.id },
    { label: 'Operational status', value: 'status' },
    { label: 'Payment status', value: (record) => record.payment?.captureStatus || record.paymentStatus },
    { label: 'Customer', value: (record) => record.customerName || record.customer?.name },
    { label: 'Email', value: (record) => record.customerEmail || record.customer?.email },
    { label: 'Phone', value: (record) => record.customerPhone || record.customer?.phone },
    { label: 'Fulfillment mode', value: (record) => record.fulfillment?.mode || 'individual_shipping' },
    { label: 'Fulfillment status', value: (record) => record.fulfillment?.status || record.status },
    { label: 'Amount', value: (record) => formatMoney(record.amountTotal || record.payment?.amountTotal || 0, record.currency || record.payment?.currency || 'usd') },
    { label: 'Campaign', value: 'campaignId' }, { label: 'Batch', value: 'batchId' },
    { label: 'Created', value: 'createdAt', format: formatDate }, { label: 'Updated', value: 'updatedAt', format: formatDate }
  ];
}

async function openDetail(config, item) {
  const { data } = await api(functionUrl('admin-detail', { resource: config.resource, id: item.id }));
  const record = data.item;
  const content = el('div', {}, [definitionList(record, detailFields(config.resource)), el('section', { className: 'page-section' }, [el('h3', { textContent: 'Complete authorized record' }), el('p', { className: 'field-help', textContent: 'Full detail is loaded only after this authorized reveal. Secrets and unsafe fields remain server-redacted where applicable.' }), jsonDetails(record)])]);
  openDrawer({ title: itemTitle(item, config.resource), description: config.title, content });
  return record;
}

async function updateOrder(item, refresh, { fulfillment = false } = {}) {
  const detail = (await api(functionUrl('admin-detail', { resource: item.resource || 'orders', id: item.id }))).data.item;
  const statusInput = el('select');
  const statuses = fulfillment
    ? ['processing', 'allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'exception', 'cancelled']
    : ['paid', 'processing', 'allocated', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'exception', 'cancelled'];
  for (const status of statuses) statusInput.append(el('option', { value: status, textContent: status.replaceAll('_', ' '), selected: detail.status === status }));
  const providerInput = el('input', { type: 'text', value: detail.shippingProvider || '', maxLength: 80 });
  const trackingInput = el('input', { type: 'text', value: detail.tracking || '', maxLength: 160 });
  const notesInput = el('textarea', { rows: 4, maxLength: 2000 }); notesInput.value = detail.internalNotes || '';
  const reasonInput = el('textarea', { rows: 3, maxLength: 500 });
  const form = el('form', { className: 'form-grid' }, [field('Status', statusInput), field('Shipping provider', providerInput), field('Tracking', trackingInput), field('Internal notes', notesInput, { span: 2 }), field('Status-change note', reasonInput, { span: 2, help: 'A note is required for church-pickup cancellation or exception status and is recommended for all material changes.' })]);
  createDialog({ title: 'Update Order', description: detail.sessionId || item.id, content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Save Changes', tone: 'primary', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-update-order', { method: 'POST', body: { sessionId: detail.sessionId || item.id, status: statusInput.value, shippingProvider: providerInput.value, tracking: trackingInput.value, internalNotes: notesInput.value, note: reasonInput.value, expectedUpdatedAt: detail.updatedAt } });
        toast('The order was updated.', { tone: 'success' }); dialog.close('saved'); refresh();
      } catch (error) { errorToast(error, 'Order update failed'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

async function updateGiveOneCode(item, refresh) {
  const detail = (await api(functionUrl('admin-detail', { resource: 'give-one-codes', id: item.id }))).data.item;
  const actionInput = el('select', {}, [
    el('option', { value: 'note', textContent: 'Add administrative note' }),
    el('option', { value: 'cancel', textContent: 'Cancel code' }),
    el('option', { value: 'reactivate', textContent: 'Reactivate code' }),
    el('option', { value: 'extend', textContent: 'Extend expiration' }),
    el('option', { value: 'reissue', textContent: 'Reissue replacement code' })
  ]);
  const expiresInput = el('input', { type: 'datetime-local' });
  const noteInput = el('textarea', { rows: 3, maxLength: 500 });
  const reasonInput = el('textarea', { rows: 3, maxLength: 1000 });
  const form = el('form', { className: 'form-grid' }, [field('Action', actionInput), field('New expiration', expiresInput, { help: 'Used only for Extend expiration.' }), field('Administrative note', noteInput, { span: 2 }), field('Explanation', reasonInput, { span: 2, help: 'Required for cancel, reactivate, reissue, and other corrective actions.' })]);
  createDialog({ title: 'Give One Code Action', description: `Code ending ${String(detail.code || '').slice(-4)}`, content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Apply Action', tone: 'primary', onClick: async ({ dialog, footer }) => {
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-update-code', { method: 'POST', body: { code: detail.code, action: actionInput.value, expiresAt: expiresInput.value ? new Date(expiresInput.value).toISOString() : '', note: noteInput.value, reason: reasonInput.value, expectedUpdatedAt: detail.updatedAt } });
        toast('The Give One code action was recorded.', { tone: 'success' }); dialog.close('saved'); refresh();
      } catch (error) { errorToast(error, 'Give One action failed'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

async function editBatch(item, refresh, initial = null) {
  const detail = initial || (await api(functionUrl('admin-detail', { resource: 'batches', id: item.id }))).data.item;
  const nameInput = el('input', { type: 'text', value: detail.name || '', required: true, maxLength: 180 });
  const statusInput = el('select', {}, ['draft', 'ready', 'submitted', 'in_production', 'shipped_to_church', 'received', 'completed', 'cancelled'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: detail.status === value })));
  const vendorInput = el('input', { type: 'text', value: detail.vendor || '', maxLength: 180 });
  const dueInput = el('input', { type: 'date', value: detail.dueDate ? String(detail.dueDate).slice(0, 10) : '' });
  const trackingInput = el('input', { type: 'text', value: detail.tracking || detail.vendorToChurchTracking || '', maxLength: 180 });
  const receivedByInput = el('input', { type: 'text', value: detail.receivedBy || '', maxLength: 160 });
  const notesInput = el('textarea', { rows: 5, maxLength: 3000 }); notesInput.value = detail.notes || '';
  const reasonInput = el('textarea', { rows: 3, maxLength: 1000 });
  const form = el('form', { className: 'form-grid' }, [field('Batch name', nameInput, { span: 2 }), field('Status', statusInput), field('Vendor', vendorInput), field('Due date', dueInput), field('Tracking', trackingInput), field('Received by', receivedByInput), field('Status-change note', reasonInput), field('Internal notes', notesInput, { span: 2 })]);
  createDialog({ title: detail.id ? 'Edit Production Batch' : 'New Production Batch', description: detail.id || 'Manual batch', wide: true, content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Save Changes', tone: 'primary', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-save-batch', { method: 'POST', body: { batch: { ...detail, name: nameInput.value.trim(), status: statusInput.value, vendor: vendorInput.value.trim(), dueDate: dueInput.value || '', tracking: trackingInput.value.trim(), vendorToChurchTracking: trackingInput.value.trim(), receivedBy: receivedByInput.value.trim(), notes: notesInput.value }, note: reasonInput.value, expectedUpdatedAt: detail.updatedAt || '' } });
        toast('The production batch was saved.', { tone: 'success' }); dialog.close('saved'); refresh();
      } catch (error) { errorToast(error, 'Production batch could not be saved'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

async function pickupAction(item, action, refresh) {
  const detail = (await api(functionUrl('admin-detail', { resource: 'pickup', id: item.id }))).data.item;
  const releasedBy = el('input', { type: 'text', maxLength: 160, required: action === 'picked_up' });
  const recipientName = el('input', { type: 'text', maxLength: 160, value: detail.customerName || '' });
  const note = el('textarea', { rows: 4, maxLength: 1000, required: ['reverse_pickup', 'exception', 'no_show'].includes(action) });
  const form = el('form', { className: 'form-grid' }, [field('Released by', releasedBy), field('Recipient name', recipientName), field('Handoff or exception note', note, { span: 2 })]);
  const labels = { picked_up: 'Record Pickup', reverse_pickup: 'Reverse Pickup', exception: 'Place in Exception', no_show: 'Record No-show' };
  createDialog({ title: labels[action], description: detail.pickupCode ? `Pickup code ending ${String(detail.pickupCode).slice(-4)}` : detail.sessionId, content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: labels[action], tone: action === 'picked_up' ? 'primary' : 'danger-outline', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-pickup-order', { method: 'POST', body: { sessionId: detail.sessionId || item.id, action, releasedBy: releasedBy.value, recipientName: recipientName.value, note: note.value, expectedUpdatedAt: detail.updatedAt } });
        toast('The church-pickup record was updated.', { tone: 'success' }); dialog.close('saved'); refresh();
      } catch (error) { errorToast(error, 'Pickup action failed'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

function exportDialog(config, filters) {
  const from = el('input', { type: 'date', value: filters.dateFrom || '' });
  const to = el('input', { type: 'date', value: filters.dateTo || '' });
  const maxRows = el('input', { type: 'number', min: '1', max: '5000', value: '5000' });
  const reason = el('textarea', { rows: 4, required: true, minLength: 10, maxLength: 1000 });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Date from', from), field('Date to', to), field('Maximum rows', maxRows), field('Business reason', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I confirm this server-generated export is necessary and will be handled securely.'])]);
  createDialog({ title: `Export ${config.title}`, description: 'Broad exports require recent authentication, bounded scope, explicit confirmation, and an audit event.', content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Export', tone: 'primary', icon: 'download', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        const filename = await downloadFromApi('/.netlify/functions/admin-export', { method: 'POST', body: { type: config.exportType, search: filters.search, status: filters.status, campaignId: filters.campaignId, from: from.value, to: to.value, maxRows: Number(maxRows.value), reason: reason.value, confirmExport: confirm.checked }, filename: `izhe-${config.exportType}.csv` });
        toast(`${filename} was generated and audited.`, { tone: 'success' }); dialog.close('exported');
      } catch (error) { errorToast(error, 'Export failed'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

async function buildChurchBatch(refresh) {
  const campaigns = (await api('/.netlify/functions/admin-campaign-data')).data.campaigns || [];
  const select = el('select', { required: true }, [el('option', { value: '', textContent: 'Select campaign' }), ...campaigns.filter((campaign) => ['church_batch', 'hybrid'].includes(campaign.fulfillmentMethod)).map((campaign) => el('option', { value: campaign.id, textContent: campaign.title || campaign.organization || campaign.id }))]);
  const form = el('form', {}, field('Campaign', select, { help: 'Only eligible, paid, unallocated church-pickup order items will be assembled. Existing submitted obligations are not edited.' }));
  createDialog({ title: 'Build or Refresh Church Pickup Batch', description: 'System-owned eligibility and allocation rules remain authoritative.', content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Build or Refresh', tone: 'primary', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        const { data } = await api('/.netlify/functions/admin-build-church-batch', { method: 'POST', body: { campaignId: select.value } });
        toast(data.batch ? `${data.unitsIncluded} units are in ${data.batch.name}.` : data.message, { tone: 'success' }); dialog.close('built'); refresh();
      } catch (error) { errorToast(error, 'Church pickup batch could not be built'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

async function pickupRosterExport(filters) {
  const campaigns = (await api('/.netlify/functions/admin-campaign-data')).data.campaigns || [];
  const campaign = el('select', { required: true }, [el('option', { value: '', textContent: 'Select campaign' }), ...campaigns.filter((item) => ['church_batch', 'hybrid'].includes(item.fulfillmentMethod)).map((item) => el('option', { value: item.id, textContent: item.title || item.organization || item.id, selected: item.id === filters.campaignId }))]);
  const from = el('input', { type: 'date', required: true, value: filters.dateFrom || '' });
  const to = el('input', { type: 'date', required: true, value: filters.dateTo || '' });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Campaign', campaign), field('Date from', from), field('Date to', to), field('Business reason', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I confirm this PII-containing pickup roster is necessary and will be handled securely.'])]);
  createDialog({ title: 'Export Pickup Roster', description: 'The roster is generated server-side; complete pickup values are never loaded into the list first.', content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Export', tone: 'primary', icon: 'download', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        const filename = await downloadFromApi('/.netlify/functions/admin-pickup-roster', { method: 'POST', body: { campaignId: campaign.value, search: filters.search, status: filters.status, dateFrom: from.value, dateTo: to.value, maxRows: 5000, reason: reason.value, confirmExport: confirm.checked }, filename: 'izhe-pickup-roster.csv' });
        toast(`${filename} was generated and audited.`, { tone: 'success' }); dialog.close('exported');
      } catch (error) { errorToast(error, 'Pickup roster export failed'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

function columnsFor(config) {
  if (config.resource === 'give-one-codes') return [
    { label: 'Code', value: 'code', render: (value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: value }), el('span', { className: 'table-secondary', textContent: item.orderId || 'Manual issuance' })]) },
    { label: 'Status', value: 'effectiveStatus', render: (value) => statusBadge(value) },
    { label: 'Campaign', value: 'campaignId' }, { label: 'Created', value: 'createdAt', render: (value) => formatDate(value, { dateOnly: true }) }, { label: 'Expires', value: 'expiresAt', render: (value) => formatDate(value, { dateOnly: true }) }
  ];
  if (config.resource === 'batches') return [
    { label: 'Batch', value: 'batchNumber', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.batchNumber || item.id }), el('span', { className: 'table-secondary', textContent: item.campaignId || 'Manual batch' })]) },
    { label: 'Status', value: 'status', render: (value) => statusBadge(value) }, { label: 'Units', value: 'itemCount', numeric: true }, { label: 'Orders', value: 'orderCount', numeric: true }, { label: 'Modified', value: 'updatedAt', render: (value) => formatDate(value, { dateOnly: true }) }
  ];
  return [
    { label: 'Order', value: 'orderNumber', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.orderNumber || item.id }), el('span', { className: 'table-secondary', textContent: `${item.customerName || 'Customer masked'} · ${item.customerEmail || 'Email masked'}` })]) },
    { label: 'Payment', value: 'paymentStatus', render: (value) => statusBadge(value || 'unknown') },
    { label: 'Fulfillment', value: 'fulfillmentStatus', render: (value, item) => el('span', {}, [statusBadge(value || 'unknown'), el('span', { className: 'table-secondary', textContent: item.fulfillmentMode?.replaceAll('_', ' ') || '' })]) },
    { label: 'Campaign', value: 'campaignId' }, { label: 'Amount', value: 'amountTotal', numeric: true, render: (value, item) => value == null ? '—' : formatMoney(value, item.currency) }, { label: 'Modified', value: 'updatedAt', render: (value) => formatDate(value, { dateOnly: true }) }
  ];
}

export async function renderOperations({ session, route }) {
  const config = CONFIG[route.id];
  if (!config) throw new Error('Unknown operations route.');
  let filters = { search: '', status: '', campaignId: '', dateFrom: '', dateTo: '', fulfillmentMode: '', exceptionOnly: false };
  let cursor = '';
  let nextCursor = '';
  const previous = [];
  let loading = false;
  const page = el('div', { className: 'page' });
  const tableRegion = el('div');
  const chips = el('div', { className: 'filter-chips' });
  const searchInput = el('input', { type: 'search', placeholder: config.searchPlaceholder, 'aria-label': config.searchPlaceholder.replace('…', '') });
  const statusSelect = el('select', { 'aria-label': 'Status filter' }, [el('option', { value: '', textContent: 'Status' }), ...config.statuses.map((value) => el('option', { value, textContent: value.replaceAll('_', ' ') }))]);
  const fulfillmentSelect = el('select', { 'aria-label': 'Fulfillment filter' }, [el('option', { value: '', textContent: 'Fulfillment' }), el('option', { value: 'individual_shipping', textContent: 'Individual shipping' }), el('option', { value: 'church_batch', textContent: 'Church pickup' })]);

  function reset() { cursor = ''; previous.length = 0; load(); }
  function renderChips() {
    chips.replaceChildren();
    const values = [
      filters.status ? [`Status: ${filters.status.replaceAll('_', ' ')}`, () => { filters.status = ''; statusSelect.value = ''; reset(); }] : null,
      filters.campaignId ? [`Campaign: ${filters.campaignId}`, () => { filters.campaignId = ''; reset(); }] : null,
      filters.fulfillmentMode ? [`Fulfillment: ${filters.fulfillmentMode.replaceAll('_', ' ')}`, () => { filters.fulfillmentMode = ''; fulfillmentSelect.value = ''; reset(); }] : null,
      filters.dateFrom ? [`From: ${filters.dateFrom}`, () => { filters.dateFrom = ''; reset(); }] : null,
      filters.dateTo ? [`To: ${filters.dateTo}`, () => { filters.dateTo = ''; reset(); }] : null,
      filters.exceptionOnly ? ['Exceptions only', () => { filters.exceptionOnly = false; reset(); }] : null
    ].filter(Boolean);
    for (const [label, remove] of values) chips.append(filterChip(label, remove));
  }

  function moreFilters() {
    const campaign = el('input', { type: 'text', value: filters.campaignId, placeholder: 'Campaign ID' });
    const from = el('input', { type: 'date', value: filters.dateFrom });
    const to = el('input', { type: 'date', value: filters.dateTo });
    const exception = el('input', { type: 'checkbox', checked: filters.exceptionOnly });
    const form = el('form', { className: 'form-grid' }, [field('Campaign', campaign), field('Date from', from), field('Date to', to), el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Exceptions' }), el('span', {}, [exception, ' Show exception records only'])])]);
    createDialog({ title: 'More Filters', description: `Lower-frequency filters for ${config.title}.`, content: form, actions: [
      { label: 'Clear Filters', tone: 'quiet', onClick: ({ dialog }) => { filters = { ...filters, campaignId: '', dateFrom: '', dateTo: '', exceptionOnly: false }; dialog.close('cleared'); reset(); } },
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Apply Filters', tone: 'primary', onClick: ({ dialog }) => { filters = { ...filters, campaignId: campaign.value.trim(), dateFrom: from.value, dateTo: to.value, exceptionOnly: exception.checked }; dialog.close('applied'); reset(); } }
    ] });
  }

  async function load() {
    if (loading) return;
    loading = true;
    renderChips();
    tableRegion.replaceChildren(dataTable({ columns: columnsFor(config), loading: true, actions: true }).shell);
    try {
      const { data } = await api(functionUrl('admin-list', { resource: config.resource, search: filters.search, status: filters.status, campaignId: filters.campaignId, dateFrom: filters.dateFrom, dateTo: filters.dateTo, fulfillmentMode: filters.fulfillmentMode, cursor, limit: 25, sort: 'updated-desc' }));
      nextCursor = data.nextCursor || '';
      let rows = data.items || [];
      if (filters.exceptionOnly) rows = rows.filter((item) => item.exception || item.status === 'exception' || item.fulfillmentStatus === 'exception');
      const table = dataTable({ rows, caption: config.title, columns: columnsFor(config), emptyTitle: `No ${config.title.toLowerCase()} found`, emptyMessage: 'Adjust search or filters and try again.', actions: (item) => [
        { label: 'View Details', onSelect: () => openDetail(config, item).catch(errorToast) },
        { label: 'Update status', visible: can(session, config.writePermission) && !['batches', 'pickup', 'give-one'].includes(route.id), onSelect: () => updateOrder({ ...item, resource: config.resource }, load, { fulfillment: route.id === 'fulfillment' }).catch(errorToast) },
        { label: 'Edit', visible: route.id === 'batches' && can(session, config.writePermission), onSelect: () => editBatch(item, load).catch(errorToast) },
        { label: 'Manage code', visible: route.id === 'give-one' && can(session, config.writePermission), onSelect: () => updateGiveOneCode(item, load).catch(errorToast) },
        { label: 'Record pickup', visible: route.id === 'pickup' && can(session, config.writePermission) && item.fulfillmentStatus !== 'picked_up', onSelect: () => pickupAction(item, 'picked_up', load).catch(errorToast) },
        { label: 'Reverse pickup', visible: route.id === 'pickup' && can(session, config.writePermission) && item.fulfillmentStatus === 'picked_up', onSelect: () => pickupAction(item, 'reverse_pickup', load).catch(errorToast) },
        { separator: true },
        { label: 'Place in exception', visible: route.id === 'pickup' && can(session, config.writePermission), danger: true, onSelect: () => pickupAction(item, 'exception', load).catch(errorToast) },
        { label: 'Record no-show', visible: route.id === 'pickup' && can(session, config.writePermission), danger: true, onSelect: () => pickupAction(item, 'no_show', load).catch(errorToast) }
      ] });
      table.shell.append(pagination({ total: data.total, returned: rows.length, hasMore: data.hasMore, hasPrevious: previous.length > 0, onNext: () => { previous.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previous.pop() || ''; load(); } }));
      tableRegion.replaceChildren(table.shell);
    } catch (error) {
      tableRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: `${config.title} could not be loaded` }), el('p', { textContent: error.message })]));
      errorToast(error);
    } finally { loading = false; }
  }

  const actions = [];
  if (route.id === 'batches' && can(session, config.writePermission)) actions.push(button('New Production Batch', { tone: 'primary', iconName: 'plus', onClick: () => editBatch({ id: '' }, load, { id: '', name: 'New Production Batch', batchType: 'manual', status: 'draft', items: [], productionSummary: [], itemCount: 0 }).catch(errorToast) }));
  if ((route.id === 'batches' || route.id === 'pickup') && can(session, 'operations.batches.write')) actions.push(button('Build Church Pickup Batch', { tone: route.id === 'pickup' ? 'primary' : 'secondary', onClick: () => buildChurchBatch(load).catch(errorToast) }));
  if (can(session, config.exportPermission)) actions.push(button('Export', { tone: 'secondary', iconName: 'download', onClick: () => route.id === 'pickup' ? pickupRosterExport(filters).catch(errorToast) : exportDialog(config, filters) }));

  page.append(
    pageHeader({ title: config.title, description: config.description, actions }),
    el('div', { className: 'toolbar' }, [
      el('div', { className: 'toolbar-search' }, [icon('search'), searchInput]),
      el('div', { className: 'filter-actions' }, [statusSelect, ['orders', 'fulfillment'].includes(route.id) ? fulfillmentSelect : null, button('More Filters', { tone: 'secondary', iconName: 'filter', className: 'filter-button', onClick: moreFilters })]),
      button('Filters', { tone: 'secondary', iconName: 'filter', className: 'filter-mobile', onClick: moreFilters })
    ]),
    chips,
    tableRegion
  );
  searchInput.addEventListener('input', debounce(() => { filters.search = searchInput.value.trim(); reset(); }, 300));
  statusSelect.addEventListener('change', () => { filters.status = statusSelect.value; reset(); });
  fulfillmentSelect.addEventListener('change', () => { filters.fulfillmentMode = fulfillmentSelect.value; reset(); });
  await load();
  return page;
}
