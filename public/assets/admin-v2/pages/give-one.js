import { api, downloadFromApi, functionUrl, stepUp } from '../api.js';
import { can } from '../permissions.js';
import { button, debounce, el, formatDate, icon, statusBadge } from '../ui/dom.js';
import { createDialog } from '../ui/dialog.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, jsonDetails, openDrawer, pageHeader, pageSection } from './page-utils.js';

function codeAction(item, refresh) {
  const action = el('select', {}, [
    el('option', { value: 'note', textContent: 'Add administrative note' }),
    el('option', { value: 'cancel', textContent: 'Cancel code' }),
    el('option', { value: 'reactivate', textContent: 'Reactivate code' }),
    el('option', { value: 'extend', textContent: 'Extend expiration' }),
    el('option', { value: 'reissue', textContent: 'Reissue replacement code' })
  ]);
  const expiresAt = el('input', { type: 'datetime-local' });
  const note = el('textarea', { rows: 3, maxLength: 1000 });
  const reason = el('textarea', { rows: 3, minLength: 10, maxLength: 1000, required: true });
  const form = el('form', { className: 'form-grid' }, [field('Action', action), field('New expiration', expiresAt), field('Administrative note', note, { span: 2 }), field('Explanation', reason, { span: 2 })]);
  createDialog({ title: 'Give One Code Action', description: item.code, content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Apply Action', tone: 'primary', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-update-code', { method: 'POST', body: { code: item.id, action: action.value, expiresAt: expiresAt.value ? new Date(expiresAt.value).toISOString() : '', note: note.value, reason: reason.value, expectedUpdatedAt: item.updatedAt || '' } });
        toast('The Give One code action was recorded.', { tone: 'success' });
        dialog.close('saved');
        refresh();
      } catch (error) {
        errorToast(error, 'Give One code action failed');
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
      }
    } }
  ] });
}

function redemptionAction(item, refresh) {
  const status = el('select', {}, ['pending', 'approved', 'in_fulfillment', 'fulfilled', 'completed', 'exception', 'cancelled'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: item.fulfillmentStatus === value || item.status === value })));
  const note = el('textarea', { rows: 4, minLength: 10, maxLength: 1500, required: true });
  const form = el('form', { className: 'form-grid' }, [field('Redemption status', status), field('Administrator note', note, { span: 2 })]);
  createDialog({ title: 'Update Give One Redemption', description: `${item.recipientName || 'Recipient masked'} · ${item.code || item.id}`, content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Save Changes', tone: 'primary', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-update-redemption', { method: 'POST', body: { id: item.id, status: status.value, note: note.value, expectedUpdatedAt: item.updatedAt || '' } });
        toast('The Give One redemption was updated.', { tone: 'success' });
        dialog.close('saved');
        refresh();
      } catch (error) {
        errorToast(error, 'Redemption update failed');
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
      }
    } }
  ] });
}

function createCodesDialog(refresh) {
  const count = el('input', { type: 'number', min: '1', max: '500', value: '1', required: true });
  const campaignId = el('input', { type: 'text', maxLength: 160 });
  const productId = el('input', { type: 'text', maxLength: 160 });
  const expiresAt = el('input', { type: 'date', required: true, value: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) });
  const note = el('textarea', { rows: 3, maxLength: 1000 });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Number of codes', count), field('Expires', expiresAt), field('Campaign ID', campaignId), field('Product ID', productId), field('Internal note', note, { span: 2 }), field('Issuance explanation', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I reviewed the quantity, campaign, product, expiration, and Give One issuance authority.'])]);
  createDialog({ title: 'Create Give One Codes', description: 'High-volume issuance is recent-authenticated, rate-limited, permission-protected, and audited.', content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Create Codes', tone: 'primary', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        await api('/.netlify/functions/admin-create-codes', { method: 'POST', body: { count: Number(count.value), campaignId: campaignId.value.trim(), productId: productId.value.trim(), expiresAt: new Date(`${expiresAt.value}T23:59:59.999Z`).toISOString(), note: note.value, reason: reason.value, confirm: confirm.checked } });
        toast(`${count.value} Give One code${Number(count.value) === 1 ? '' : 's'} created.`, { tone: 'success' });
        dialog.close('created');
        refresh();
      } catch (error) {
        if (error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '')) { stepUp(); return false; }
        errorToast(error, 'Give One codes could not be created');
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
      }
    } }
  ] });
}

function exportDialog(type, filters) {
  const from = el('input', { type: 'date' });
  const to = el('input', { type: 'date' });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Date from', from), field('Date to', to), field('Business reason', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I confirm this export is necessary and will be handled securely.'])]);
  createDialog({ title: `Export Give One ${type === 'codes' ? 'Codes' : 'Redemptions'}`, description: 'The export is generated server-side, bounded, recent-authenticated, and audited.', content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Export', tone: 'primary', icon: 'download', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        const filename = await downloadFromApi('/.netlify/functions/admin-export', { method: 'POST', body: { type, search: filters.search, status: filters.status, campaignId: filters.campaignId, from: from.value, to: to.value, maxRows: 5000, reason: reason.value, confirmExport: confirm.checked }, filename: `izhe-give-one-${type}.csv` });
        toast(`${filename} was generated and audited.`, { tone: 'success' });
        dialog.close('exported');
      } catch (error) {
        if (error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '')) { stepUp(); return false; }
        errorToast(error, 'Give One export failed');
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
      }
    } }
  ] });
}

function pagedResource({ resource, tableRegion, columns, actions, search, status, campaignId }) {
  let cursor = '';
  let nextCursor = '';
  const previous = [];
  async function load() {
    tableRegion.replaceChildren(dataTable({ columns, loading: true, actions: true }).shell);
    try {
      const { data } = await api(functionUrl('admin-list', { resource, search: search(), status: status(), campaignId: campaignId(), cursor, limit: 25, sort: 'updated-desc' }));
      nextCursor = data.nextCursor || '';
      const table = dataTable({ rows: data.items || [], columns, actions: (item) => actions(item, load), emptyTitle: `No ${resource.replaceAll('-', ' ')} found`, emptyMessage: 'Adjust search or filters and try again.' });
      table.shell.append(pagination({ total: data.total, returned: (data.items || []).length, hasMore: data.hasMore, hasPrevious: previous.length > 0, onNext: () => { previous.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previous.pop() || ''; load(); } }));
      tableRegion.replaceChildren(table.shell);
    } catch (error) { tableRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Give One data could not be loaded' }), el('p', { textContent: error.message })])); errorToast(error); }
  }
  return { load, reset: () => { cursor = ''; previous.length = 0; return load(); } };
}

export async function renderGiveOne({ session }) {
  let search = '';
  let status = '';
  let campaignId = '';
  const page = el('div', { className: 'page' });
  const codesRegion = el('div');
  const redemptionsRegion = el('div');
  const searchInput = el('input', { type: 'search', placeholder: 'Search Give One codes and redemptions…', 'aria-label': 'Search Give One records' });
  const statusSelect = el('select', { 'aria-label': 'Give One status filter' }, [el('option', { value: '', textContent: 'Status' }), ...['active', 'redeemed', 'expired', 'pending', 'approved', 'in_fulfillment', 'fulfilled', 'completed', 'exception', 'cancelled'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' ') }))]);
  const campaignInput = el('input', { type: 'text', placeholder: 'Campaign ID', 'aria-label': 'Campaign ID filter' });
  const codes = pagedResource({
    resource: 'give-one-codes', tableRegion: codesRegion, search: () => search, status: () => status, campaignId: () => campaignId,
    columns: [
      { label: 'Code', value: 'code', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.code }), el('span', { className: 'table-secondary', textContent: item.orderId || 'Manual issuance' })]) },
      { label: 'Status', value: 'effectiveStatus', render: (value) => statusBadge(value) }, { label: 'Campaign', value: 'campaignId' },
      { label: 'Created', value: 'createdAt', render: (value) => formatDate(value, { dateOnly: true }) }, { label: 'Expires', value: 'expiresAt', render: (value) => formatDate(value, { dateOnly: true }) }
    ],
    actions: (item, refresh) => [
      { label: 'View Details', onSelect: async () => { const detail = (await api(functionUrl('admin-detail', { resource: 'give-one-codes', id: item.id }))).data.item; openDrawer({ title: detail.code || item.code, content: jsonDetails(detail) }); } },
      { label: 'Manage code', visible: can(session, 'operations.give_one.write'), onSelect: () => codeAction(item, refresh) }
    ]
  });
  const redemptions = pagedResource({
    resource: 'redemptions', tableRegion: redemptionsRegion, search: () => search, status: () => status, campaignId: () => campaignId,
    columns: [
      { label: 'Recipient', value: 'recipientName', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.recipientName || 'Recipient masked' }), el('span', { className: 'table-secondary', textContent: item.recipientEmail || 'Email masked' })]) },
      { label: 'Code', value: 'code' }, { label: 'Status', value: 'fulfillmentStatus', render: (value) => statusBadge(value || 'pending') },
      { label: 'Campaign', value: 'campaignId' }, { label: 'Modified', value: 'updatedAt', render: (value) => formatDate(value, { dateOnly: true }) }
    ],
    actions: (item, refresh) => [
      { label: 'View Details', onSelect: async () => { const detail = (await api(functionUrl('admin-detail', { resource: 'redemptions', id: item.id }))).data.item; openDrawer({ title: `Redemption ${item.id}`, content: jsonDetails(detail) }); } },
      { label: 'Update status', visible: can(session, 'operations.give_one.write'), onSelect: () => redemptionAction(item, refresh) }
    ]
  });
  async function refresh() { await Promise.all([codes.reset(), redemptions.reset()]); }
  const actions = [];
  if (can(session, 'operations.give_one.write')) actions.push(button('Create Codes', { tone: 'primary', iconName: 'plus', onClick: () => createCodesDialog(refresh) }));
  if (can(session, 'operations.give_one.export')) actions.push(button('Export Codes', { tone: 'secondary', iconName: 'download', onClick: () => exportDialog('codes', { search, status, campaignId }) }), button('Export Redemptions', { tone: 'secondary', iconName: 'download', onClick: () => exportDialog('redemptions', { search, status, campaignId }) }));
  page.append(
    pageHeader({ title: 'Give One', description: 'Code issuance, claim lifecycle, gift fulfillment, exception handling, and dedicated audited exports. Complete values are revealed only in authorized detail views.', actions }),
    el('div', { className: 'toolbar' }, [el('div', { className: 'toolbar-search' }, [icon('search'), searchInput]), el('div', { className: 'filter-actions' }, [statusSelect, campaignInput])]),
    pageSection({ title: 'Give One codes', description: 'Masked claim codes, effective status, campaign attribution, expiration, and corrective actions.', content: codesRegion }),
    pageSection({ title: 'Redemptions', description: 'Recipient and fulfillment records are masked in lists and loaded in full only when opened.', content: redemptionsRegion })
  );
  searchInput.addEventListener('input', debounce(() => { search = searchInput.value.trim(); refresh(); }, 300));
  statusSelect.addEventListener('change', () => { status = statusSelect.value; refresh(); });
  campaignInput.addEventListener('input', debounce(() => { campaignId = campaignInput.value.trim(); refresh(); }, 300));
  await refresh();
  return page;
}
