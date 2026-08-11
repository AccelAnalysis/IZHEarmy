import { api, downloadFromApi, functionUrl, logout, stepUp } from '../api.js';
import { can, roleLabels } from '../permissions.js';
import { button, debounce, definitionList, el, formatDate, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog, createDialog } from '../ui/dialog.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, filterChip, jsonDetails, openDrawer, pageHeader, pageSection } from './page-utils.js';

const FALLBACK_ROLES = Object.freeze([
  ['owner', 'Owner'],
  ['operations_administrator', 'Operations Administrator'],
  ['catalog_content_editor', 'Catalog and Content Editor'],
  ['publisher', 'Publisher'],
  ['campaign_administrator', 'Campaign Administrator'],
  ['finance_accountability_administrator', 'Finance and Accountability Administrator'],
  ['accountability_approver', 'Accountability Approver'],
  ['accountability_period_manager', 'Accountability Period Manager'],
  ['auditor', 'Auditor / Read Only']
]);

function rolesFromPayload(payload) {
  const raw = payload?.roles || payload?.roleDefinitions || payload?.availableRoles;
  if (Array.isArray(raw)) {
    return raw.map((role) => [role.id || role.value || String(role), role.label || role.name || String(role)]);
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([id, value]) => [id, value?.label || value?.name || id]);
  }
  return FALLBACK_ROLES;
}

function roleCheckboxes(roles, selected = []) {
  const selectedSet = new Set(selected || []);
  return roles.map(([id, label]) => {
    const input = el('input', { type: 'checkbox', value: id, checked: selectedSet.has(id), dataset: { roleId: id } });
    return el('label', { className: 'field' }, [el('span', {}, [input, ' ', label])]);
  });
}

function selectedRoles(container) {
  return [...container.querySelectorAll('input[data-role-id]:checked')].map((input) => input.dataset.roleId);
}

function inviteAdministrator(payload, refresh) {
  const availableRoles = rolesFromPayload(payload);
  const email = el('input', { type: 'email', required: true, maxLength: 320, autocomplete: 'off' });
  const displayName = el('input', { type: 'text', required: true, maxLength: 180, autocomplete: 'off' });
  const roles = el('div', { className: 'form-grid span-2' }, roleCheckboxes(availableRoles, ['auditor']));
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [
    field('Verified email address', email), field('Display name', displayName),
    el('fieldset', { className: 'span-2 form-section' }, [el('legend', { className: 'field-label', textContent: 'Initial roles' }), roles]),
    field('Invitation explanation', reason, { span: 2 }),
    el('label', { className: 'span-2' }, [confirm, ' I confirmed the individual requires administrator access and the selected roles follow least privilege.'])
  ]);
  createDialog({
    title: 'Invite Administrator',
    description: 'Administrator registration is invitation-only. The verified email is bound to the provider subject on first successful MFA-backed login.',
    wide: true,
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Send Invitation', tone: 'primary', onClick: async ({ dialog, footer }) => {
        const chosen = selectedRoles(roles);
        if (!chosen.length) { toast('Select at least one role.', { tone: 'warning' }); return false; }
        if (!form.reportValidity()) return false;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await api('/.netlify/functions/admin-invite-user', {
            method: 'POST',
            body: { email: email.value.trim(), displayName: displayName.value.trim(), roles: chosen, reason: reason.value, confirm: confirm.checked }
          });
          toast(`An administrator invitation was created for ${email.value.trim()}.`, { tone: 'success' });
          dialog.close('invited');
          refresh();
        } catch (error) {
          if (error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '')) {
            stepUp();
            return false;
          }
          errorToast(error, 'Administrator invitation failed');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

function editAdministrator(payload, user, refresh) {
  const availableRoles = rolesFromPayload(payload);
  const status = el('select', {}, ['invited', 'active', 'suspended', 'disabled'].map((value) => el('option', { value, textContent: value, selected: user.status === value })));
  const roles = el('div', { className: 'form-grid span-2' }, roleCheckboxes(availableRoles, user.roles || []));
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [
    field('Account status', status),
    el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'MFA assurance' }), statusBadge(user.mfaSatisfiedAt || user.mfaAssurance ? 'active' : 'warning', user.mfaSatisfiedAt || user.mfaAssurance ? 'Satisfied' : 'Not yet recorded')]),
    el('fieldset', { className: 'span-2 form-section' }, [el('legend', { className: 'field-label', textContent: 'Roles' }), roles]),
    field('Change explanation', reason, { span: 2 }),
    el('label', { className: 'span-2' }, [confirm, ' I reviewed the user, status, selected roles, and effect on active sessions.'])
  ]);
  createDialog({
    title: 'Update Administrator',
    description: `${user.displayName || user.email} · ${user.email}. Sensitive permission changes revoke active sessions and the final active Owner cannot be removed or demoted.`,
    wide: true,
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Save Changes', tone: 'primary', onClick: async ({ dialog, footer }) => {
        const chosen = selectedRoles(roles);
        if (!chosen.length) { toast('Select at least one role.', { tone: 'warning' }); return false; }
        if (!form.reportValidity()) return false;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await api('/.netlify/functions/admin-update-user', {
            method: 'POST',
            body: {
              id: user.id,
              userId: user.id,
              status: status.value,
              roles: chosen,
              changes: { status: status.value, roles: chosen },
              expectedUpdatedAt: user.updatedAt || '',
              reason: reason.value,
              confirm: confirm.checked
            }
          });
          toast(`${user.displayName || user.email} was updated.`, { tone: 'success' });
          dialog.close('saved');
          refresh();
        } catch (error) {
          if (error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '')) {
            stepUp();
            return false;
          }
          errorToast(error, 'Administrator could not be updated');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

export async function renderUsers({ session }) {
  let payload = null;
  const page = el('div', { className: 'page' });
  const region = el('div');
  async function load() {
    try {
      payload = (await api('/.netlify/functions/admin-users')).data;
      const users = payload.users || payload.items || [];
      const table = dataTable({
        rows: users,
        caption: 'Administrators and roles',
        columns: [
          { label: 'Administrator', value: 'displayName', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.displayName || item.email }), el('span', { className: 'table-secondary', textContent: item.email })]) },
          { label: 'Status', value: 'status', render: (value) => statusBadge(value) },
          { label: 'Roles', value: 'roles', render: (value) => Array.isArray(value) ? value.map((item) => String(item).replaceAll('_', ' ')).join(', ') : '—' },
          { label: 'MFA', value: 'mfaSatisfiedAt', render: (_value, item) => statusBadge(item.mfaSatisfiedAt || item.mfaAssurance ? 'active' : 'warning', item.mfaSatisfiedAt || item.mfaAssurance ? 'Satisfied' : 'Pending') },
          { label: 'Last login', value: 'lastLoginAt', render: (value) => formatDate(value) }
        ],
        actions: (item) => [
          { label: 'View Details', onSelect: () => openDrawer({ title: item.displayName || item.email, description: item.email, content: definitionList(item, [
            { label: 'User ID', value: 'id' }, { label: 'Provider subject bound', value: (record) => record.providerSubject ? 'Yes' : 'No' },
            { label: 'Email verified', value: (record) => record.emailVerified ? 'Yes' : 'No' }, { label: 'Status', value: 'status' },
            { label: 'Roles', value: (record) => (record.roles || []).join(', ') }, { label: 'Created', value: 'createdAt', format: formatDate },
            { label: 'Last login', value: 'lastLoginAt', format: formatDate }, { label: 'Latest MFA state', value: (record) => record.mfaSatisfiedAt || record.mfaAssurance || 'Not yet recorded' }
          ]) }) },
          { label: 'Edit roles and status', visible: can(session, 'administration.roles.manage'), onSelect: () => editAdministrator(payload, item, load) },
          { label: 'View sessions', onSelect: () => window.history.pushState({}, '', `/admin/administration/sessions?userId=${encodeURIComponent(item.id)}`) }
        ],
        emptyTitle: 'No administrator records found',
        emptyMessage: 'Bootstrap the first Owner or create an invitation using a configured named-account identity provider.'
      });
      region.replaceChildren(table.shell);
    } catch (error) {
      region.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Administrators could not be loaded' }), el('p', { textContent: error.message })]));
      errorToast(error);
    }
  }
  page.append(
    pageHeader({
      title: 'Administrators & Roles',
      description: 'Invitation-only named accounts, provider binding, MFA state, least-privilege roles, suspension, disablement, and final-Owner protection.',
      actions: can(session, 'administration.users.manage') ? [button('Invite Administrator', { tone: 'primary', iconName: 'plus', onClick: () => inviteAdministrator(payload || {}, load) })] : []
    }),
    region
  );
  await load();
  return page;
}

function revokeSessionDialog(item, refresh, { all = false } = {}) {
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Revocation explanation', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, all ? ' Revoke every active session for this administrator.' : ' Revoke this session immediately.'])]);
  createDialog({
    title: all ? 'Revoke All Sessions' : 'Revoke Session',
    description: all ? 'Every server-side session for the selected administrator will be invalidated.' : 'The selected opaque server-side session will be invalidated.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: all ? 'Revoke All' : 'Revoke Session', tone: 'danger', onClick: async ({ dialog, footer }) => {
        if (!form.reportValidity()) return;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await api('/.netlify/functions/admin-revoke-session', {
            method: 'POST',
            body: {
              sessionId: all ? '' : item.id || item.sessionId,
              userId: item.userId,
              revokeAll: all,
              all,
              reason: reason.value,
              confirm: confirm.checked
            }
          });
          toast(all ? 'All selected administrator sessions were revoked.' : 'The administrator session was revoked.', { tone: 'success' });
          dialog.close('revoked');
          refresh();
        } catch (error) {
          if (error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '')) {
            stepUp();
            return false;
          }
          errorToast(error, 'Session revocation failed');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

export async function renderSessions({ session }) {
  const page = el('div', { className: 'page' });
  const region = el('div');
  async function load() {
    try {
      const { data } = await api('/.netlify/functions/admin-sessions');
      const sessions = data.sessions || data.items || [];
      const table = dataTable({
        rows: sessions,
        caption: 'Active administrator sessions',
        columns: [
          { label: 'Administrator', value: 'displayName', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.displayName || item.email || item.userId }), el('span', { className: 'table-secondary', textContent: item.email || item.userId })]) },
          { label: 'Device', value: 'userAgentSummary', render: (_value, item) => `${item.userAgentSummary?.browser || item.browser || 'Unknown browser'} · ${item.userAgentSummary?.platform || item.platform || 'Unknown device'}` },
          { label: 'Created', value: 'createdAt', render: (value) => formatDate(value) },
          { label: 'Last activity', value: 'lastActivityAt', render: (value) => formatDate(value) },
          { label: 'Expires', value: 'absoluteExpiresAt', render: (value, item) => formatDate(value || item.expiresAt) },
          { label: 'Status', value: 'revokedAt', render: (value, item) => statusBadge(value || item.status === 'revoked' ? 'revoked' : item.current ? 'active' : 'active', item.current ? 'Current' : value ? 'Revoked' : 'Active') }
        ],
        actions: (item) => [
          { label: 'View Details', onSelect: () => openDrawer({ title: item.displayName || item.email || item.userId, description: item.current ? 'Current session' : 'Administrator session', content: jsonDetails(item) }) },
          { label: 'Revoke session', danger: true, visible: can(session, 'administration.sessions.manage') || item.current || item.userId === session.user?.id || item.userId === session.userId, disabled: Boolean(item.revokedAt), onSelect: () => revokeSessionDialog(item, load) },
          { label: 'Revoke all sessions for user', danger: true, visible: can(session, 'administration.sessions.manage'), onSelect: () => revokeSessionDialog(item, load, { all: true }) }
        ],
        emptyTitle: 'No active sessions found',
        emptyMessage: 'Administrator sessions will appear after successful named-account login.'
      });
      region.replaceChildren(table.shell);
    } catch (error) {
      region.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Sessions could not be loaded' }), el('p', { textContent: error.message })]));
      errorToast(error);
    }
  }
  page.append(
    pageHeader({
      title: 'Active Sessions',
      description: 'Opaque server-side sessions, device summaries, activity, idle and absolute expiration, and explicit revocation.',
      actions: [button('Authenticate Again', { tone: 'secondary', iconName: 'lock', onClick: () => stepUp() })]
    }),
    region
  );
  await load();
  return page;
}

function auditExportDialog(filters) {
  const dateFrom = el('input', { type: 'date', value: filters.dateFrom || '', required: true });
  const dateTo = el('input', { type: 'date', value: filters.dateTo || '', required: true });
  const maxRows = el('input', { type: 'number', min: '1', max: '5000', value: '1000', required: true });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [field('Date from', dateFrom), field('Date to', dateTo), field('Maximum events', maxRows), field('Export reason', reason, { span: 2 }), el('label', { className: 'span-2' }, [confirm, ' I confirm this audit export is necessary and will be handled securely.'])]);
  createDialog({
    title: 'Export Audit Log',
    description: 'The export is bounded, recent-authenticated, generated server-side, and recorded as a new audit event.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Export', tone: 'primary', icon: 'download', onClick: async ({ dialog, footer }) => {
        if (!form.reportValidity()) return;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          const filename = await downloadFromApi('/.netlify/functions/admin-audit-export', {
            method: 'POST',
            body: { ...filters, dateFrom: dateFrom.value, dateTo: dateTo.value, maxRows: Number(maxRows.value), reason: reason.value, confirmExport: confirm.checked },
            filename: 'izhe-admin-audit.csv'
          });
          toast(`${filename} was generated and audited.`, { tone: 'success' });
          dialog.close('exported');
        } catch (error) {
          if (error?.code === 'recent_auth_required' || /recent authentication/i.test(error?.message || '')) {
            stepUp();
            return false;
          }
          errorToast(error, 'Audit export failed');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

export async function renderAudit({ session }) {
  let filters = { actor: '', action: '', resourceType: '', result: '', dateFrom: '', dateTo: '' };
  let cursor = '';
  let nextCursor = '';
  const previous = [];
  const page = el('div', { className: 'page' });
  const tableRegion = el('div');
  const chips = el('div', { className: 'filter-chips' });
  const actorInput = el('input', { type: 'search', placeholder: 'Search actor…', 'aria-label': 'Search audit actor' });
  const actionInput = el('input', { type: 'text', placeholder: 'Action', 'aria-label': 'Filter audit action' });
  const resourceInput = el('input', { type: 'text', placeholder: 'Resource type', 'aria-label': 'Filter resource type' });
  const resultSelect = el('select', { 'aria-label': 'Filter audit result' }, [el('option', { value: '', textContent: 'Result' }), ...['success', 'denied', 'failure', 'preview'].map((value) => el('option', { value, textContent: value }))]);

  function reset() { cursor = ''; previous.length = 0; load(); }
  function renderChips() {
    chips.replaceChildren();
    for (const [key, label, control] of [['actor', 'Actor', actorInput], ['action', 'Action', actionInput], ['resourceType', 'Resource', resourceInput], ['result', 'Result', resultSelect]]) {
      if (filters[key]) chips.append(filterChip(`${label}: ${filters[key]}`, () => { filters[key] = ''; control.value = ''; reset(); }));
    }
  }
  function moreFilters() {
    const from = el('input', { type: 'date', value: filters.dateFrom });
    const to = el('input', { type: 'date', value: filters.dateTo });
    const form = el('form', { className: 'form-grid' }, [field('Date from', from), field('Date to', to)]);
    createDialog({ title: 'More Filters', description: 'Bound audit history by event date.', content: form, actions: [
      { label: 'Clear Filters', tone: 'quiet', onClick: ({ dialog }) => { filters.dateFrom = ''; filters.dateTo = ''; dialog.close('cleared'); reset(); } },
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Apply Filters', tone: 'primary', onClick: ({ dialog }) => { filters.dateFrom = from.value; filters.dateTo = to.value; dialog.close('applied'); reset(); } }
    ] });
  }
  async function verifyIntegrity() {
    try {
      const { data } = await api('/.netlify/functions/admin-audit-verify');
      toast(data.valid === false ? 'Audit-chain verification detected an integrity problem.' : `Audit-chain verification passed for ${data.count ?? data.eventsVerified ?? 'the returned'} events.`, { title: 'Audit integrity verification', tone: data.valid === false ? 'danger' : 'success', timeout: 9000 });
    } catch (error) { errorToast(error, 'Audit integrity verification failed'); }
  }
  async function load() {
    renderChips();
    tableRegion.replaceChildren(dataTable({ columns: [{ label: 'Event', value: 'action' }, { label: 'Actor', value: 'actorDisplayName' }], loading: true, actions: true }).shell);
    try {
      const { data } = await api(functionUrl('admin-audit', { ...filters, cursor, limit: 50 }));
      const items = data.items || data.events || [];
      nextCursor = data.nextCursor || '';
      const table = dataTable({
        rows: items,
        caption: 'Administrative audit log',
        columns: [
          { label: 'Event', value: 'action', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: String(item.action || 'event').replaceAll('_', ' ') }), el('span', { className: 'table-secondary', textContent: `${item.resourceType || 'resource'}${item.resourceId ? ` · ${item.resourceId}` : ''}` })]) },
          { label: 'Actor', value: 'actorDisplayName', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.actorDisplayName || item.actorEmail || item.actorUserId || 'System' }), el('span', { className: 'table-secondary', textContent: item.actorEmail || '' })]) },
          { label: 'Result', value: 'result', render: (value) => statusBadge(value || 'unknown') },
          { label: 'Timestamp', value: 'timestamp', render: (value) => formatDate(value) },
          { label: 'Integrity', value: 'eventHash', render: (value) => statusBadge(value ? 'active' : 'warning', value ? 'Chained' : 'Unavailable') }
        ],
        actions: (item) => [{ label: 'View Details', onSelect: () => openDrawer({ title: String(item.action || 'Audit event').replaceAll('_', ' '), description: item.eventId, content: jsonDetails(item) }) }],
        emptyTitle: 'No audit events found',
        emptyMessage: 'Adjust the actor, action, resource, result, or date filters.'
      });
      table.shell.append(pagination({ total: data.total || items.length, returned: items.length, hasMore: Boolean(data.hasMore || nextCursor), hasPrevious: previous.length > 0, onNext: () => { previous.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previous.pop() || ''; load(); } }));
      tableRegion.replaceChildren(table.shell);
    } catch (error) {
      tableRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Audit log could not be loaded' }), el('p', { textContent: error.message })]));
      errorToast(error);
    }
  }

  page.append(
    pageHeader({
      title: 'Audit Log',
      description: 'Read-only attributable security and operational events with redacted summaries and hash-chain integrity verification.',
      actions: [button('Verify Integrity', { tone: 'secondary', iconName: 'check', onClick: verifyIntegrity }), button('Export', { tone: 'secondary', iconName: 'download', onClick: () => auditExportDialog(filters) })]
    }),
    el('div', { className: 'toolbar' }, [
      el('div', { className: 'toolbar-search' }, [icon('search'), actorInput]),
      el('div', { className: 'filter-actions' }, [actionInput, resourceInput, resultSelect, button('More Filters', { tone: 'secondary', iconName: 'filter', className: 'filter-button', onClick: moreFilters })]),
      button('Filters', { tone: 'secondary', iconName: 'filter', className: 'filter-mobile', onClick: moreFilters })
    ]),
    chips,
    tableRegion
  );
  actorInput.addEventListener('input', debounce(() => { filters.actor = actorInput.value.trim(); reset(); }, 300));
  actionInput.addEventListener('input', debounce(() => { filters.action = actionInput.value.trim(); reset(); }, 300));
  resourceInput.addEventListener('input', debounce(() => { filters.resourceType = resourceInput.value.trim(); reset(); }, 300));
  resultSelect.addEventListener('change', () => { filters.result = resultSelect.value; reset(); });
  await load();
  return page;
}
