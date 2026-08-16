import { api, downloadFromApi, functionUrl, stepUp } from '../api.js';
import { can } from '../permissions.js';
import { button, debounce, definitionList, el, formatDate, formatMoney, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog, createDialog } from '../ui/dialog.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, filterChip, jsonDetails, openDrawer, pageHeader, pageSection } from './page-utils.js';

const ENTRY_TYPES = Object.freeze([
  ['campaign_cost', 'Campaign cost'],
  ['support_payment', 'Ministry support payment'],
  ['cost_reversal', 'Campaign cost reversal'],
  ['payment_reversal', 'Ministry support payment reversal']
]);

function dollarsToCents(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function recentAuthError(error) {
  return error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '');
}

async function withRecentAuth(action) {
  try {
    return await action();
  } catch (error) {
    if (recentAuthError(error)) {
      confirmDialog({
        title: 'Recent authentication required',
        description: 'This sensitive action requires a fresh MFA-backed administrator authentication.',
        confirmLabel: 'Authenticate Again',
        onConfirm: () => stepUp()
      });
      return null;
    }
    throw error;
  }
}

function accountabilityEntryDialog({ campaigns, onCreated }) {
  const type = el('select', { required: true }, ENTRY_TYPES.map(([value, label]) => el('option', { value, textContent: label })));
  const campaign = el('select', {}, [el('option', { value: '', textContent: 'General / unattributed' }), ...campaigns.map((item) => el('option', { value: item.campaignId, textContent: `${item.campaignTitle || item.campaignId} — ${item.organization || 'No organization'}` }))]);
  const amount = el('input', { type: 'number', min: '0.01', step: '0.01', required: true });
  const effectiveAt = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10), required: true });
  const reference = el('input', { type: 'text', maxLength: 240, required: true });
  const notes = el('textarea', { rows: 4, maxLength: 3000, required: true });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const form = el('form', { className: 'form-grid' }, [
    field('Entry type', type), field('Campaign', campaign),
    field('Amount', amount, { help: 'Enter dollars; the server records integer cents.' }), field('Effective date', effectiveAt),
    field('Reference', reference, { span: 2, help: 'Use a durable payment, invoice, receipt, or correction reference.' }),
    field('Entry notes', notes, { span: 2 }),
    field('Request explanation', reason, { span: 2, help: 'The entry remains pending until a separately authorized approver acts.' })
  ]);
  createDialog({
    title: 'Create Accountability Entry Request',
    description: 'This creates a pending append-only ledger action; it does not overwrite prior financial history.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Submit for Approval', tone: 'primary', onClick: async ({ dialog, footer }) => {
        if (!form.reportValidity()) return;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          const entry = {
            type: type.value,
            campaignId: campaign.value,
            amount: dollarsToCents(amount.value),
            currency: 'usd',
            effectiveAt: new Date(`${effectiveAt.value}T12:00:00`).toISOString(),
            reference: reference.value.trim(),
            notes: notes.value,
            note: notes.value,
            idempotencyKey: `admin-v2-${crypto.randomUUID()}`
          };
          await withRecentAuth(() => api('/.netlify/functions/admin-save-ledger-entry', { method: 'POST', body: { entry, reason: reason.value, approveNow: false } }));
          toast('The accountability entry was submitted for separate approval.', { tone: 'success' });
          dialog.close('created');
          onCreated?.();
        } catch (error) {
          errorToast(error, 'Accountability request could not be created');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

function reviewAccountabilityRequest(item, action, refresh) {
  const approve = action === 'approve';
  confirmDialog({
    title: approve ? 'Approve Accountability Entry' : 'Reject Accountability Entry',
    description: approve
      ? 'Approval appends the validated entry to the ledger. Existing entries are never edited in place.'
      : 'Rejection preserves the request and review decision in administrative history.',
    confirmLabel: approve ? 'Approve and Append' : 'Reject Request',
    tone: approve ? 'primary' : 'danger',
    requireReason: true,
    requireCheckbox: approve,
    checkboxLabel: approve ? 'I reviewed the amount, effective date, campaign attribution, reference, and reporting-period status.' : '',
    onConfirm: async ({ reason }) => {
      try {
        await withRecentAuth(() => api('/.netlify/functions/admin-review-accountability', {
          method: 'POST',
          body: { id: item.id, action, reason, confirmSameActor: approve }
        }));
        toast(`The accountability request was ${approve ? 'approved' : 'rejected'}.`, { tone: 'success' });
        refresh();
      } catch (error) {
        errorToast(error, 'Accountability review failed');
        return false;
      }
      return true;
    }
  });
}

function reconciliationDialog(onRequested) {
  const sessionId = el('input', { type: 'text', required: true, maxLength: 180, placeholder: 'Checkout Session / order reference' });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const preview = el('div', { className: 'empty-state', textContent: 'Enter an order reference and run a dry-run preview.' });
  const form = el('form', { className: 'form-grid' }, [field('Order reference', sessionId, { span: 2 }), field('Repair-request explanation', reason, { span: 2 }), el('div', { className: 'span-2', id: 'reconciliation-preview-region' }, preview)]);
  let report = null;
  const modal = createDialog({
    title: 'Reconcile Payment with Stripe',
    description: 'Preview immutable Stripe facts first. Applying a repair requires a separate, recently authenticated approver.',
    wide: true,
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Preview', tone: 'secondary', icon: 'eye', onClick: async () => {
        if (!sessionId.value.trim()) { form.reportValidity(); return; }
        try {
          const { data } = await api('/.netlify/functions/admin-reconcile-payment', { method: 'POST', body: { mode: 'preview', sessionId: sessionId.value.trim() } });
          report = data.report;
          preview.replaceChildren(
            el('h3', { textContent: report.repairPlan?.length ? 'Repair plan identified' : 'No material repair plan identified' }),
            el('p', { textContent: `${report.differences?.length || 0} canonical payment differences; ${report.giveOne?.missing?.length || 0} missing Give One obligations; campaign attribution ${report.campaign?.matches ? 'matches' : 'requires manual review'}.` }),
            jsonDetails(report)
          );
        } catch (error) { errorToast(error, 'Payment preview failed'); }
      } },
      { label: 'Request Approval', tone: 'primary', onClick: async ({ dialog, footer }) => {
        if (!report || !reason.value.trim() || !form.reportValidity()) { toast('Run the preview and enter an explanation first.', { tone: 'warning' }); return false; }
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await withRecentAuth(() => api('/.netlify/functions/admin-reconcile-payment', { method: 'POST', body: { mode: 'request', sessionId: sessionId.value.trim(), reason: reason.value } }));
          toast('The Stripe reconciliation was submitted for separate approval.', { tone: 'success' });
          dialog.close('requested');
          onRequested?.();
        } catch (error) {
          errorToast(error, 'Reconciliation request could not be created');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
  return modal;
}

function refundAllocationDialog(onRequested) {
  const sessionId = el('input', { type: 'text', required: true, maxLength: 180 });
  const refundId = el('input', { type: 'text', required: true, maxLength: 180 });
  const lineJson = el('textarea', { rows: 6, spellcheck: false });
  lineJson.value = '[]';
  const shipping = el('input', { type: 'number', min: '0', step: '0.01', value: '0.00' });
  const tax = el('input', { type: 'number', min: '0', step: '0.01', value: '0.00' });
  const unallocated = el('input', { type: 'number', min: '0', step: '0.01', value: '0.00' });
  const allocationNote = el('textarea', { rows: 3, maxLength: 3000, required: true });
  const reason = el('textarea', { rows: 3, minLength: 10, maxLength: 1000, required: true });
  const preview = el('div', { className: 'empty-state', textContent: 'Run a dry-run validation before requesting approval.' });
  const form = el('form', { className: 'form-grid' }, [
    field('Order reference', sessionId), field('Verified Stripe refund ID', refundId),
    field('Line allocations JSON', lineJson, { span: 2, help: 'Array entries use {"lineId":"immutable-line-id","amount":1234,"wholeUnitIndexes":[0]}; amount is cents.' }),
    field('Shipping allocation (dollars)', shipping), field('Tax allocation (dollars)', tax), field('Unallocated amount (dollars)', unallocated),
    field('Allocation note', allocationNote, { span: 2 }), field('Request explanation', reason, { span: 2 }),
    el('div', { className: 'span-2' }, preview)
  ]);
  let allocation = null;
  let validated = false;
  function collect() {
    let lineAllocations;
    try { lineAllocations = JSON.parse(lineJson.value || '[]'); }
    catch { lineJson.setCustomValidity('Enter valid JSON.'); lineJson.reportValidity(); lineJson.setCustomValidity(''); return null; }
    if (!Array.isArray(lineAllocations)) { lineJson.setCustomValidity('Line allocations must be a JSON array.'); lineJson.reportValidity(); lineJson.setCustomValidity(''); return null; }
    return {
      sourceRefundId: refundId.value.trim(),
      lineAllocations,
      shippingAmount: dollarsToCents(shipping.value),
      taxAmount: dollarsToCents(tax.value),
      unallocatedAmount: dollarsToCents(unallocated.value),
      note: allocationNote.value
    };
  }
  createDialog({
    title: 'Allocate Verified Refund',
    description: 'Refund allocation remains append-only. A separate approver must apply the validated request.',
    wide: true,
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Preview', tone: 'secondary', icon: 'eye', onClick: async () => {
        if (!form.reportValidity()) return;
        allocation = collect();
        if (!allocation) return;
        try {
          const { data } = await api('/.netlify/functions/admin-allocate-refund', { method: 'POST', body: { mode: 'preview', sessionId: sessionId.value.trim(), allocation } });
          validated = true;
          preview.replaceChildren(el('h3', { textContent: 'Refund allocation is valid' }), jsonDetails(data.preview));
        } catch (error) { validated = false; errorToast(error, 'Refund allocation preview failed'); }
      } },
      { label: 'Request Approval', tone: 'primary', onClick: async ({ dialog, footer }) => {
        if (!validated || !allocation || !reason.value.trim()) { toast('Complete a valid preview and explanation first.', { tone: 'warning' }); return false; }
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await withRecentAuth(() => api('/.netlify/functions/admin-allocate-refund', { method: 'POST', body: { mode: 'request', sessionId: sessionId.value.trim(), allocation, reason: reason.value } }));
          toast('The refund allocation was submitted for separate approval.', { tone: 'success' });
          dialog.close('requested');
          onRequested?.();
        } catch (error) {
          errorToast(error, 'Refund allocation request could not be created');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

function applyFinancialAction(item, refresh) {
  const endpoint = item.type === 'payment_reconciliation'
    ? '/.netlify/functions/admin-reconcile-payment'
    : item.type === 'refund_allocation'
      ? '/.netlify/functions/admin-allocate-refund'
      : '';
  if (!endpoint) {
    toast('This financial action requires a specialized review workflow that is not available from this queue.', { tone: 'warning' });
    return;
  }
  confirmDialog({
    title: item.type === 'payment_reconciliation' ? 'Apply Stripe Reconciliation' : 'Apply Refund Allocation',
    description: 'The underlying order revision and verified financial facts will be checked again before any append-only change is applied.',
    confirmLabel: 'Approve and Apply',
    requireReason: true,
    requireCheckbox: true,
    checkboxLabel: 'I reviewed the requester, preview summary, source facts, amount, campaign attribution, and current order revision.',
    onConfirm: async ({ reason }) => {
      try {
        await withRecentAuth(() => api(endpoint, { method: 'POST', body: { mode: 'apply', financialActionId: item.id, reason, confirmSameActor: true } }));
        toast('The approved financial action was applied.', { tone: 'success' });
        refresh();
      } catch (error) { errorToast(error, 'Financial action could not be applied'); return false; }
      return true;
    }
  });
}

function rejectFinancialAction(item, refresh) {
  confirmDialog({
    title: 'Reject Financial Action',
    description: 'The request and rejection reason remain in the review queue and audit history.',
    confirmLabel: 'Reject Request', tone: 'danger', requireReason: true,
    onConfirm: async ({ reason }) => {
      try {
        await withRecentAuth(() => api('/.netlify/functions/admin-reject-financial-action', { method: 'POST', body: { id: item.id, reason } }));
        toast('The financial action request was rejected.', { tone: 'success' });
        refresh();
      } catch (error) { errorToast(error, 'Financial action could not be rejected'); return false; }
      return true;
    }
  });
}

function reportingPeriodDialog(period, refresh) {
  const periodInput = el('input', { type: 'month', required: true, value: period?.period || new Date().toISOString().slice(0, 7) });
  const action = el('select', {}, [el('option', { value: period?.status === 'locked' ? 'unlock' : 'lock', textContent: period?.status === 'locked' ? 'Unlock period' : 'Lock period' }), el('option', { value: period?.status === 'locked' ? 'lock' : 'unlock', textContent: period?.status === 'locked' ? 'Lock period' : 'Unlock period' })]);
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Reporting period', periodInput), field('Action', action), field('Explanation', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I understand this changes whether new accountability entries may be requested or approved for the period.'])]);
  createDialog({
    title: 'Change Reporting-period Lock',
    description: 'Lock and unlock events are immutable and attributable. Existing ledger entries are never rewritten.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Apply', tone: action.value === 'unlock' ? 'danger-outline' : 'primary', onClick: async ({ dialog, footer }) => {
        if (!form.reportValidity()) return;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await withRecentAuth(() => api('/.netlify/functions/admin-update-accountability-period', { method: 'POST', body: { period: periodInput.value, action: action.value, reason: reason.value, confirm: confirm.checked, expectedRevision: period?.revision ?? 0 } }));
          toast(`The ${periodInput.value} reporting period was ${action.value === 'lock' ? 'locked' : 'unlocked'}.`, { tone: 'success' });
          dialog.close('updated');
          refresh();
        } catch (error) {
          errorToast(error, 'Reporting-period status could not be changed');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

function accountabilityExportDialog() {
  const type = el('select', {}, [el('option', { value: 'summary', textContent: 'Accountability summary' }), el('option', { value: 'ledger', textContent: 'Ledger entries' })]);
  const dateFrom = el('input', { type: 'date' });
  const dateTo = el('input', { type: 'date' });
  const campaignId = el('input', { type: 'text', maxLength: 120 });
  const maxRows = el('input', { type: 'number', min: '1', max: '5000', value: '500' });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Export type', type), field('Campaign ID', campaignId), field('Date from', dateFrom), field('Date to', dateTo), field('Maximum rows', maxRows), field('Business reason', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I confirm this financial export is necessary and will be handled securely.'])]);
  createDialog({
    title: 'Export Accountability Data',
    description: 'Ledger exports require a bounded date range. All exports require recent authentication and an audit event.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Export', tone: 'primary', icon: 'download', onClick: async ({ dialog, footer }) => {
        if (!form.reportValidity()) return;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          const filename = await withRecentAuth(() => downloadFromApi('/.netlify/functions/admin-finance-export', { method: 'POST', body: { type: type.value, campaignId: campaignId.value.trim(), dateFrom: dateFrom.value, dateTo: dateTo.value, maxRows: Number(maxRows.value), reason: reason.value, confirmExport: confirm.checked }, filename: `izhe-accountability-${type.value}.csv` }));
          if (filename) { toast(`${filename} was generated and audited.`, { tone: 'success' }); dialog.close('exported'); }
        } catch (error) {
          errorToast(error, 'Accountability export failed');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

export async function renderAccountability({ session }) {
  let overview = null;
  let approvals = [];
  let financialActions = [];
  let periods = [];
  let ledgerCursor = '';
  let ledgerNextCursor = '';
  const ledgerPrevious = [];
  let ledgerSearch = '';
  let ledgerCampaign = '';
  const page = el('div', { className: 'page' });
  const summaryRegion = el('div');
  const campaignsRegion = el('div');
  const ledgerRegion = el('div');
  const approvalsRegion = el('div');
  const financialRegion = el('div');
  const periodsRegion = el('div');
  const ledgerSearchInput = el('input', { type: 'search', placeholder: 'Search ledger…', 'aria-label': 'Search ledger' });
  const ledgerCampaignInput = el('input', { type: 'text', placeholder: 'Campaign ID', 'aria-label': 'Filter ledger by campaign ID' });
  const ledgerChips = el('div', { className: 'filter-chips' });

  async function loadQueues() {
    const [approvalResponse, actionResponse, periodResponse] = await Promise.all([
      api(functionUrl('admin-accountability-approvals', { limit: 200 })),
      api(functionUrl('admin-financial-actions', { limit: 200 })),
      api(functionUrl('admin-accountability-periods', { limit: 120 }))
    ]);
    approvals = approvalResponse.data.items || [];
    financialActions = actionResponse.data.items || [];
    periods = periodResponse.data.periods || [];
    renderApprovalQueues();
    renderPeriods();
  }

  async function loadOverview() {
    overview = (await api('/.netlify/functions/admin-finance-data')).data;
    renderOverview();
  }

  function renderOverview() {
    const totals = overview?.totals || {};
    summaryRegion.replaceChildren(el('div', { className: 'kpi-grid' }, [
      ['Net collected', formatMoney(totals.netCollected || 0), 'After verified refunds'].map ? null : null,
      el('article', { className: 'kpi-card' }, [el('span', { className: 'kpi-label', textContent: 'Net collected' }), el('strong', { className: 'kpi-value', textContent: formatMoney(totals.netCollected || 0) }), el('span', { className: 'kpi-meta', textContent: 'After verified refunds' })]),
      el('article', { className: 'kpi-card' }, [el('span', { className: 'kpi-label', textContent: 'Verified net deposits' }), el('strong', { className: 'kpi-value', textContent: formatMoney(totals.verifiedNetDeposit || 0) }), el('span', { className: 'kpi-meta', textContent: 'Processor-verified' })]),
      el('article', { className: 'kpi-card' }, [el('span', { className: 'kpi-label', textContent: 'Support outstanding' }), el('strong', { className: 'kpi-value', textContent: formatMoney(totals.supportOutstanding || 0) }), el('span', { className: 'kpi-meta', textContent: `${formatMoney(totals.supportPaid || 0)} paid` })]),
      el('article', { className: 'kpi-card' }, [el('span', { className: 'kpi-label', textContent: 'Give One outstanding' }), el('strong', { className: 'kpi-value', textContent: String(totals.giveOneOutstanding || 0) }), el('span', { className: 'kpi-meta', textContent: `${totals.giveOneObligations || 0} total obligations` })])
    ].filter(Boolean)));
    const campaignTable = dataTable({
      rows: overview?.campaigns || [],
      caption: 'Campaign accountability',
      columns: [
        { label: 'Campaign', value: 'campaignTitle', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.campaignTitle || item.campaignId }), el('span', { className: 'table-secondary', textContent: item.organization || 'No organization' })]) },
        { label: 'Settlement', value: 'settlementStatus', render: (value) => statusBadge(value || 'open') },
        { label: 'Net collected', value: 'netCollected', numeric: true, render: (value) => formatMoney(value) },
        { label: 'Support accrued', value: 'supportAccrued', numeric: true, render: (value) => formatMoney(value) },
        { label: 'Support paid', value: 'supportPaid', numeric: true, render: (value) => formatMoney(value) },
        { label: 'Outstanding', value: 'supportOutstanding', numeric: true, render: (value) => formatMoney(value) },
        { label: 'Give One due', value: 'giveOneOutstanding', numeric: true }
      ],
      actions: (item) => [{ label: 'View Details', onSelect: () => openDrawer({ title: item.campaignTitle || item.campaignId, description: item.organization, content: definitionList(item, [
        { label: 'Campaign ID', value: 'campaignId' }, { label: 'Settlement status', value: 'settlementStatus' },
        { label: 'Verified net deposit', value: 'verifiedNetDeposit', format: formatMoney }, { label: 'Processor fees', value: 'processorFees', format: formatMoney },
        { label: 'Dispute losses', value: 'disputeLosses', format: formatMoney }, { label: 'Campaign costs', value: 'campaignCosts', format: formatMoney },
        { label: 'Support accrued', value: 'supportAccrued', format: formatMoney }, { label: 'Support paid', value: 'supportPaid', format: formatMoney },
        { label: 'Support outstanding', value: 'supportOutstanding', format: formatMoney }, { label: 'Give One outstanding', value: 'giveOneOutstanding' }
      ]) }) }]
    });
    campaignsRegion.replaceChildren(campaignTable.shell);
  }

  async function loadLedger() {
    ledgerChips.replaceChildren();
    if (ledgerCampaign) ledgerChips.append(filterChip(`Campaign: ${ledgerCampaign}`, () => { ledgerCampaign = ''; ledgerCampaignInput.value = ''; ledgerCursor = ''; ledgerPrevious.length = 0; loadLedger(); }));
    ledgerRegion.replaceChildren(dataTable({ columns: [{ label: 'Entry', value: 'id' }, { label: 'Amount', value: 'amount' }], loading: true, actions: true }).shell);
    try {
      const { data } = await api(functionUrl('admin-list', { resource: 'accountability', search: ledgerSearch, campaignId: ledgerCampaign, cursor: ledgerCursor, limit: 25, sort: 'updated-desc' }));
      ledgerNextCursor = data.nextCursor || '';
      const table = dataTable({
        rows: data.items || [],
        caption: 'Accountability ledger',
        columns: [
          { label: 'Entry', value: 'type', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: String(item.type || 'entry').replaceAll('_', ' ') }), el('span', { className: 'table-secondary', textContent: item.reference || item.id })]) },
          { label: 'Campaign', value: 'campaignId' },
          { label: 'Amount', value: 'amount', numeric: true, render: (value, item) => formatMoney(value, item.currency) },
          { label: 'Effective', value: 'effectiveAt', render: (value) => formatDate(value, { dateOnly: true }) },
          { label: 'Recorded', value: 'createdAt', render: (value) => formatDate(value, { dateOnly: true }) }
        ],
        actions: (item) => [{ label: 'View Details', onSelect: async () => {
          try {
            const detail = (await api(functionUrl('admin-detail', { resource: 'accountability', id: item.id }))).data.item;
            openDrawer({ title: String(detail.type || 'Ledger entry').replaceAll('_', ' '), description: detail.id, content: jsonDetails(detail) });
          } catch (error) { errorToast(error); }
        } }]
      });
      table.shell.append(pagination({ total: data.total, returned: (data.items || []).length, hasMore: data.hasMore, hasPrevious: ledgerPrevious.length > 0, onNext: () => { ledgerPrevious.push(ledgerCursor); ledgerCursor = ledgerNextCursor; loadLedger(); }, onPrevious: () => { ledgerCursor = ledgerPrevious.pop() || ''; loadLedger(); } }));
      ledgerRegion.replaceChildren(table.shell);
    } catch (error) { ledgerRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Ledger could not be loaded' }), el('p', { textContent: error.message })])); errorToast(error); }
  }

  function renderApprovalQueues() {
    const pendingApprovals = approvals.filter((item) => item.status === 'pending');
    const approvalsTable = dataTable({
      rows: approvals,
      caption: 'Accountability approval requests',
      columns: [
        { label: 'Request', value: 'id', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: String(item.entry?.type || 'entry').replaceAll('_', ' ') }), el('span', { className: 'table-secondary', textContent: `${item.requestedByDisplayName || item.requestedByEmail || item.requestedBy} · ${item.id}` })]) },
        { label: 'Campaign', value: (item) => item.entry?.campaignId || 'General' },
        { label: 'Amount', value: (item) => item.entry?.amount, numeric: true, render: (value) => formatMoney(value) },
        { label: 'Status', value: 'status', render: (value) => statusBadge(value) },
        { label: 'Requested', value: 'requestedAt', render: (value) => formatDate(value) }
      ],
      actions: (item) => [
        { label: 'View Details', onSelect: () => openDrawer({ title: 'Accountability approval request', description: item.id, content: jsonDetails(item) }) },
        { label: 'Approve', visible: can(session, 'accountability.approve') && item.status === 'pending', onSelect: () => reviewAccountabilityRequest(item, 'approve', loadAll) },
        { label: 'Reject', danger: true, visible: can(session, 'accountability.approve') && item.status === 'pending', onSelect: () => reviewAccountabilityRequest(item, 'reject', loadAll) }
      ],
      emptyTitle: 'No accountability approval requests',
      emptyMessage: 'New append-only entry requests will appear here.'
    });
    approvalsRegion.replaceChildren(approvalsTable.shell);

    const actionsTable = dataTable({
      rows: financialActions,
      caption: 'Financial action requests',
      columns: [
        { label: 'Action', value: 'type', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: String(item.type || '').replaceAll('_', ' ') }), el('span', { className: 'table-secondary', textContent: `${item.resourceId || 'No resource'} · ${item.requestedByDisplayName || item.requestedByEmail || item.requestedBy}` })]) },
        { label: 'Status', value: 'status', render: (value) => statusBadge(value) },
        { label: 'Requested', value: 'requestedAt', render: (value) => formatDate(value) },
        { label: 'Reviewed', value: 'reviewedAt', render: (value) => formatDate(value) }
      ],
      actions: (item) => [
        { label: 'View Details', onSelect: () => openDrawer({ title: String(item.type || 'Financial action').replaceAll('_', ' '), description: item.id, content: jsonDetails(item) }) },
        { label: 'Approve and Apply', visible: can(session, 'accountability.approve') && item.status === 'pending' && ['payment_reconciliation', 'refund_allocation'].includes(item.type), onSelect: () => applyFinancialAction(item, loadAll) },
        { label: 'Reject', danger: true, visible: can(session, 'accountability.approve') && item.status === 'pending', onSelect: () => rejectFinancialAction(item, loadAll) }
      ],
      emptyTitle: 'No financial action requests',
      emptyMessage: 'Stripe reconciliation and refund allocation requests will appear here.'
    });
    financialRegion.replaceChildren(actionsTable.shell);
  }

  function renderPeriods() {
    const table = dataTable({
      rows: periods,
      caption: 'Accountability reporting periods',
      columns: [
        { label: 'Period', value: 'period' }, { label: 'Status', value: 'status', render: (value) => statusBadge(value) },
        { label: 'Locked', value: 'lockedAt', render: (value) => formatDate(value) }, { label: 'Unlocked', value: 'unlockedAt', render: (value) => formatDate(value) },
        { label: 'Revision', value: 'revision', numeric: true }
      ],
      actions: (item) => [
        { label: 'View Details', onSelect: () => openDrawer({ title: `Reporting period ${item.period}`, content: jsonDetails(item) }) },
        { label: item.status === 'locked' ? 'Unlock' : 'Lock', visible: can(session, 'accountability.lock_period'), danger: item.status === 'locked', onSelect: () => reportingPeriodDialog(item, loadAll) }
      ],
      emptyTitle: 'No reporting periods have been explicitly locked',
      emptyMessage: 'Unlisted periods are open. Lock or unlock events become immutable history.'
    });
    periodsRegion.replaceChildren(table.shell);
  }

  async function loadAll() {
    await Promise.all([loadOverview(), loadLedger(), loadQueues()]);
  }

  const actions = [];
  if (can(session, 'accountability.write')) actions.push(button('New Ledger Request', { tone: 'primary', iconName: 'plus', onClick: () => accountabilityEntryDialog({ campaigns: overview?.campaigns || [], onCreated: loadAll }) }));
  if (can(session, 'accountability.write')) actions.push(button('Reconcile Payment', { tone: 'secondary', onClick: () => reconciliationDialog(loadAll) }));
  if (can(session, 'accountability.write')) actions.push(button('Allocate Refund', { tone: 'secondary', onClick: () => refundAllocationDialog(loadAll) }));
  if (can(session, 'accountability.export')) actions.push(button('Export', { tone: 'secondary', iconName: 'download', onClick: accountabilityExportDialog }));

  page.append(
    pageHeader({ title: 'Accountability', description: 'Organization and campaign economics, append-only ledger actions, approval separation, Stripe reconciliation, refund allocation, period locks, and audited exports.', actions }),
    summaryRegion,
    pageSection({ title: 'Campaign accountability', description: 'Support accrued, paid, and outstanding; campaign costs; verified payment economics; and Give One obligations.', content: campaignsRegion }),
    pageSection({ title: 'Ledger', description: 'Append-only financial history with server-side search, campaign filtering, and bounded pagination.', action: null, content: el('div', {}, [el('div', { className: 'toolbar' }, [el('div', { className: 'toolbar-search' }, [icon('search'), ledgerSearchInput]), el('div', { className: 'filter-actions' }, ledgerCampaignInput)]), ledgerChips, ledgerRegion]) }),
    pageSection({ title: 'Entry approval requests', description: 'Writing and approval are separate permissions. A sole Owner override requires recent authentication, explicit confirmation, and an audit event.', content: approvalsRegion }),
    pageSection({ title: 'Financial action requests', description: 'Payment reconciliation and refund allocation are previewed, requested, independently approved, revision-checked, and applied.', content: financialRegion }),
    pageSection({ title: 'Reporting-period locks', description: 'Locks prevent new requests and approvals for the selected month without rewriting existing ledger history.', action: can(session, 'accountability.lock_period') ? button('Change Period Lock', { tone: 'secondary', iconName: 'lock', onClick: () => reportingPeriodDialog(null, loadAll) }) : null, content: periodsRegion })
  );

  ledgerSearchInput.addEventListener('input', debounce(() => { ledgerSearch = ledgerSearchInput.value.trim(); ledgerCursor = ''; ledgerPrevious.length = 0; loadLedger(); }, 300));
  ledgerCampaignInput.addEventListener('input', debounce(() => { ledgerCampaign = ledgerCampaignInput.value.trim(); ledgerCursor = ''; ledgerPrevious.length = 0; loadLedger(); }, 300));
  await loadAll();
  return page;
}
