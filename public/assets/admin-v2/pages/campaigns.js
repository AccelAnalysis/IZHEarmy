import { api, downloadFromApi, functionUrl } from '../api.js';
import { can } from '../permissions.js';
import { button, debounce, el, formatDate, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog, createDialog } from '../ui/dialog.js';
import { mediaPickerButton } from '../ui/media-picker.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, filterChip, openDrawer, pageHeader } from './page-utils.js';

function newCampaign() {
  const suffix = crypto.randomUUID().slice(0, 8).toLowerCase();
  return {
    id: `campaign-${suffix}`,
    slug: `campaign-${suffix}`,
    title: 'New Campaign',
    organization: '',
    ministryObjective: '',
    status: 'draft',
    publishStatus: 'draft',
    fulfillmentMethod: 'individual_shipping',
    supportModel: 'none',
    supportRate: 0,
    startAt: '',
    endAt: '',
    images: [],
    churchBatch: {}
  };
}

function primaryImage(campaign) {
  return campaign.image || campaign.images?.[0] || null;
}

async function campaignEditor({ session, id, refresh, initial = null }) {
  const detail = initial
    ? { item: initial, etag: '', catalogRevision: null }
    : (await api(functionUrl('admin-detail', { resource: 'campaigns', id }))).data;
  const original = structuredClone(detail.item);
  const campaign = structuredClone(detail.item);
  let image = primaryImage(campaign);

  const idInput = el('input', { type: 'text', value: campaign.id || '', required: true, readOnly: Boolean(original.createdAt), maxLength: 120 });
  const slugInput = el('input', { type: 'text', value: campaign.slug || '', required: true, maxLength: 140 });
  const titleInput = el('input', { type: 'text', value: campaign.title || '', required: true, maxLength: 220 });
  const organizationInput = el('input', { type: 'text', value: campaign.organization || campaign.churchName || '', required: true, maxLength: 220 });
  const objectiveInput = el('textarea', { rows: 5, maxLength: 4000 });
  objectiveInput.value = campaign.ministryObjective || '';
  const statusSelect = el('select', {}, ['draft', 'review', 'scheduled', 'active', 'completed', 'archived'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: campaign.status === value })));
  const publishSelect = el('select', {}, ['draft', 'published', 'unpublished', 'archived'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: (campaign.publishStatus || campaign.status) === value })));
  const fulfillmentSelect = el('select', {}, ['individual_shipping', 'church_batch', 'hybrid'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: campaign.fulfillmentMethod === value })));
  const supportModelSelect = el('select', {}, ['none', 'percentage', 'fixed_per_unit', 'fixed_total'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: campaign.supportModel === value })));
  const supportRateInput = el('input', { type: 'number', min: '0', step: '0.01', value: Number(campaign.supportRate || 0) });
  const startInput = el('input', { type: 'datetime-local', value: campaign.startAt ? String(campaign.startAt).slice(0, 16) : '' });
  const endInput = el('input', { type: 'datetime-local', value: campaign.endAt ? String(campaign.endAt).slice(0, 16) : '' });
  const pickupNameInput = el('input', { type: 'text', value: campaign.churchBatch?.pickupLocationName || '', maxLength: 220 });
  const address1Input = el('input', { type: 'text', value: campaign.churchBatch?.address1 || campaign.churchBatch?.pickupAddress?.address1 || '', maxLength: 220 });
  const cityInput = el('input', { type: 'text', value: campaign.churchBatch?.city || campaign.churchBatch?.pickupAddress?.city || '', maxLength: 120 });
  const stateInput = el('input', { type: 'text', value: campaign.churchBatch?.state || campaign.churchBatch?.pickupAddress?.state || '', maxLength: 40 });
  const postalInput = el('input', { type: 'text', value: campaign.churchBatch?.postalCode || campaign.churchBatch?.pickupAddress?.postalCode || '', maxLength: 24 });
  const pickupStartInput = el('input', { type: 'datetime-local', value: campaign.churchBatch?.pickupStartAt ? String(campaign.churchBatch.pickupStartAt).slice(0, 16) : '' });
  const pickupEndInput = el('input', { type: 'datetime-local', value: campaign.churchBatch?.pickupEndAt ? String(campaign.churchBatch.pickupEndAt).slice(0, 16) : '' });
  const instructionsInput = el('textarea', { rows: 4, maxLength: 3000 });
  instructionsInput.value = campaign.churchBatch?.internalInstructions || '';
  const imagePreview = el('div', { className: 'media-inspector-preview' });

  function renderImage() {
    imagePreview.replaceChildren(image?.url
      ? el('img', { src: image.url, alt: image.alt || image.altText || '' })
      : el('span', { textContent: 'No campaign image selected' }));
  }
  renderImage();

  const churchFields = el('section', { className: 'form-section' }, [
    el('h3', { textContent: 'Church pickup configuration' }),
    el('p', { textContent: 'These fields describe pickup—not shipping—and are used by the existing church-batch state machine.' }),
    el('div', { className: 'form-grid' }, [
      field('Pickup location name', pickupNameInput),
      field('Street address', address1Input),
      field('City', cityInput),
      field('State', stateInput),
      field('Postal code', postalInput),
      field('Pickup window starts', pickupStartInput),
      field('Pickup window ends', pickupEndInput),
      field('Internal pickup instructions', instructionsInput, { span: 2 })
    ])
  ]);
  churchFields.hidden = !['church_batch', 'hybrid'].includes(fulfillmentSelect.value);
  fulfillmentSelect.addEventListener('change', () => { churchFields.hidden = !['church_batch', 'hybrid'].includes(fulfillmentSelect.value); });

  const form = el('form', {}, [
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Campaign identity and timing' }),
      el('p', { textContent: 'Campaign records preserve existing church-batch, support, and accountability semantics.' }),
      el('div', { className: 'form-grid' }, [
        field('Campaign ID', idInput), field('URL slug', slugInput),
        field('Campaign title', titleInput), field('Church or ministry', organizationInput),
        field('Campaign status', statusSelect), field('Publishing status', publishSelect),
        field('Starts', startInput), field('Ends', endInput),
        field('Ministry objective', objectiveInput, { span: 2 })
      ])
    ]),
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Fulfillment and support formula' }),
      el('p', { textContent: 'These values remain subject to the repository’s existing campaign validation and accountability calculations.' }),
      el('div', { className: 'form-grid' }, [
        field('Fulfillment mode', fulfillmentSelect), field('Support model', supportModelSelect), field('Support rate', supportRateInput)
      ])
    ]),
    churchFields,
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Campaign imagery' }),
      el('div', { className: 'split-workspace' }, [
        el('div', {}, mediaPickerButton({
          session,
          selectedId: image?.mediaId || image?.id || '',
          contextLabel: 'this campaign',
          onSelect: (media) => {
            image = media ? { id: media.id, mediaId: media.id, url: media.thumbnailUrl, alt: media.altText, title: media.title, filename: media.filename } : null;
            renderImage();
          }
        })),
        imagePreview
      ])
    ])
  ]);

  function collect(statusOverride = '') {
    const pickupAddress = {
      address1: address1Input.value.trim(),
      city: cityInput.value.trim(),
      state: stateInput.value.trim(),
      postalCode: postalInput.value.trim()
    };
    return {
      ...campaign,
      id: idInput.value.trim(),
      slug: slugInput.value.trim(),
      title: titleInput.value.trim(),
      organization: organizationInput.value.trim(),
      ministryObjective: objectiveInput.value,
      status: statusSelect.value,
      publishStatus: statusOverride || publishSelect.value,
      fulfillmentMethod: fulfillmentSelect.value,
      supportModel: supportModelSelect.value,
      supportRate: Number(supportRateInput.value || 0),
      startAt: startInput.value ? new Date(startInput.value).toISOString() : '',
      endAt: endInput.value ? new Date(endInput.value).toISOString() : '',
      image,
      images: image ? [image, ...(campaign.images || []).slice(1)] : [],
      churchBatch: {
        ...(campaign.churchBatch || {}),
        pickupLocationName: pickupNameInput.value.trim(),
        ...pickupAddress,
        pickupAddress,
        pickupStartAt: pickupStartInput.value ? new Date(pickupStartInput.value).toISOString() : '',
        pickupEndAt: pickupEndInput.value ? new Date(pickupEndInput.value).toISOString() : '',
        internalInstructions: instructionsInput.value
      }
    };
  }

  async function save(statusOverride = '') {
    if (!form.reportValidity()) return;
    try {
      const next = collect(statusOverride);
      const { data } = await api('/.netlify/functions/admin-save-campaign', {
        method: 'POST',
        body: {
          campaign: next,
          originalId: original.createdAt ? original.id : '',
          expectedUpdatedAt: original.updatedAt || '',
          expectedEtag: detail.etag || ''
        }
      });
      Object.assign(campaign, data.campaign || next);
      toast(`${campaign.title} was saved.`, { tone: 'success' });
      await refresh();
    } catch (error) {
      errorToast(error, 'Campaign could not be saved');
    }
  }

  const sticky = el('div', { className: 'sticky-action-bar' }, [
    el('span', { className: 'field-help', textContent: original.updatedAt ? `Last saved ${formatDate(original.updatedAt)}` : 'New draft campaign' }),
    el('div', { className: 'page-actions' }, [
      button('Save Changes', { tone: 'secondary', onClick: () => save() }),
      can(session, 'campaigns.publish') ? button((campaign.publishStatus || campaign.status) === 'published' ? 'Unpublish' : 'Publish', { tone: 'primary', onClick: () => save((campaign.publishStatus || campaign.status) === 'published' ? 'unpublished' : 'published') }) : null
    ])
  ]);
  const { drawer } = openDrawer({ title: campaign.title || 'Campaign editor', description: campaign.organization || campaign.id, content: [form, sticky] });
  drawer.style.width = 'min(980px, 100vw)';
}

function campaignExportDialog(filters) {
  const maxCampaigns = el('input', { type: 'number', min: '1', max: '1000', value: '500', required: true });
  const reason = el('textarea', { rows: 4, minLength: 10, maxLength: 1000, required: true });
  const confirm = el('input', { type: 'checkbox', required: true });
  const form = el('form', { className: 'form-grid' }, [
    field('Maximum campaigns', maxCampaigns),
    field('Business reason', reason, { span: 2 }),
    el('label', { className: 'span-2' }, [confirm, ' I confirm this campaign report is necessary and will be handled securely.'])
  ]);
  createDialog({
    title: 'Export Campaign Report',
    description: 'The report is generated server-side, bounded, recent-authenticated, and recorded in the audit history.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Export', tone: 'primary', icon: 'download', onClick: async ({ dialog, footer }) => {
        if (!form.reportValidity()) return;
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          const filename = await downloadFromApi('/.netlify/functions/admin-campaign-report', {
            method: 'POST',
            body: { status: filters.status, maxCampaigns: Number(maxCampaigns.value), reason: reason.value, confirmExport: confirm.checked },
            filename: 'izhe-campaign-report.csv'
          });
          toast(`${filename} was generated and audited.`, { tone: 'success' });
          dialog.close('exported');
        } catch (error) {
          errorToast(error, 'Campaign report could not be exported');
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

export async function renderCampaigns({ session }) {
  let filters = { search: '', status: '', fulfillmentMode: '', dateFrom: '', dateTo: '' };
  let cursor = '';
  let nextCursor = '';
  const previous = [];
  let loading = false;
  const page = el('div', { className: 'page' });
  const tableRegion = el('div');
  const chips = el('div', { className: 'filter-chips' });
  const searchInput = el('input', { type: 'search', placeholder: 'Search campaigns…', 'aria-label': 'Search campaigns' });
  const statusSelect = el('select', { 'aria-label': 'Campaign status' }, [el('option', { value: '', textContent: 'Status' }), ...['draft', 'review', 'scheduled', 'active', 'completed', 'archived', 'published'].map((value) => el('option', { value, textContent: value }))]);
  const fulfillmentSelect = el('select', { 'aria-label': 'Fulfillment mode' }, [el('option', { value: '', textContent: 'Fulfillment' }), el('option', { value: 'individual_shipping', textContent: 'Individual shipping' }), el('option', { value: 'church_batch', textContent: 'Church pickup' }), el('option', { value: 'hybrid', textContent: 'Hybrid' })]);

  function reset() { cursor = ''; previous.length = 0; load(); }
  function renderChips() {
    chips.replaceChildren();
    if (filters.status) chips.append(filterChip(`Status: ${filters.status}`, () => { filters.status = ''; statusSelect.value = ''; reset(); }));
    if (filters.fulfillmentMode) chips.append(filterChip(`Fulfillment: ${filters.fulfillmentMode.replaceAll('_', ' ')}`, () => { filters.fulfillmentMode = ''; fulfillmentSelect.value = ''; reset(); }));
    if (filters.dateFrom) chips.append(filterChip(`From: ${filters.dateFrom}`, () => { filters.dateFrom = ''; reset(); }));
    if (filters.dateTo) chips.append(filterChip(`To: ${filters.dateTo}`, () => { filters.dateTo = ''; reset(); }));
  }

  function moreFilters() {
    const from = el('input', { type: 'date', value: filters.dateFrom });
    const to = el('input', { type: 'date', value: filters.dateTo });
    const form = el('form', { className: 'form-grid' }, [field('Campaign starts on or after', from), field('Campaign starts on or before', to)]);
    createDialog({
      title: 'More Filters',
      description: 'Lower-frequency campaign timing criteria.',
      content: form,
      actions: [
        { label: 'Clear Filters', tone: 'quiet', onClick: ({ dialog }) => { filters.dateFrom = ''; filters.dateTo = ''; dialog.close('cleared'); reset(); } },
        { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
        { label: 'Apply Filters', tone: 'primary', onClick: ({ dialog }) => { filters.dateFrom = from.value; filters.dateTo = to.value; dialog.close('applied'); reset(); } }
      ]
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    renderChips();
    tableRegion.replaceChildren(dataTable({ columns: [{ label: 'Campaign', value: 'name' }, { label: 'Status', value: 'status' }], loading: true, actions: true }).shell);
    try {
      const { data } = await api(functionUrl('admin-list', {
        resource: 'campaigns', search: filters.search, status: filters.status, fulfillmentMode: filters.fulfillmentMode,
        dateFrom: filters.dateFrom, dateTo: filters.dateTo, cursor, limit: 25, sort: 'updated-desc'
      }));
      nextCursor = data.nextCursor || '';
      const table = dataTable({
        rows: data.items || [],
        caption: 'Campaigns',
        columns: [
          { label: 'Campaign', value: 'name', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.name || item.id }), el('span', { className: 'table-secondary', textContent: `${item.churchName || 'No organization'} · ${item.slug || item.id}` })]) },
          { label: 'Status', value: 'status', render: (value, item) => statusBadge(item.publishStatus || value || 'draft') },
          { label: 'Fulfillment', value: 'fulfillmentMode', render: (value) => String(value || '—').replaceAll('_', ' ') },
          { label: 'Starts', value: 'startsAt', render: (value) => formatDate(value, { dateOnly: true }) },
          { label: 'Ends', value: 'endsAt', render: (value) => formatDate(value, { dateOnly: true }) },
          { label: 'Accountability', value: 'accountabilityStatus', render: (value) => value ? statusBadge(value) : '—' }
        ],
        actions: (item) => [
          { label: 'Edit', visible: can(session, 'campaigns.write'), onSelect: () => campaignEditor({ session, id: item.id, refresh: load }).catch(errorToast) },
          { label: 'Preview', onSelect: () => window.open(`/campaign.html?campaign=${encodeURIComponent(item.slug || item.id)}&preview=1`, '_blank', 'noopener,noreferrer') },
          { label: item.publishStatus === 'published' ? 'Unpublish' : 'Publish', visible: can(session, 'campaigns.publish'), onSelect: async () => {
            const detail = (await api(functionUrl('admin-detail', { resource: 'campaigns', id: item.id }))).data;
            await api('/.netlify/functions/admin-save-campaign', { method: 'POST', body: { campaign: { ...detail.item, publishStatus: item.publishStatus === 'published' ? 'unpublished' : 'published' }, originalId: item.id, expectedUpdatedAt: detail.item.updatedAt || '', expectedEtag: detail.etag || '' } });
            toast(`${item.name} was updated.`, { tone: 'success' });
            load();
          } },
          { separator: true },
          { label: 'Archive', danger: true, visible: can(session, 'campaigns.publish') && item.status !== 'archived', onSelect: () => confirmDialog({
            title: 'Archive Campaign',
            description: 'The campaign is removed from active administration views while order, pickup, batch, and accountability history remains intact.',
            confirmLabel: 'Archive', tone: 'danger', requireReason: true, requireCheckbox: true,
            onConfirm: async ({ reason }) => {
              const detail = (await api(functionUrl('admin-detail', { resource: 'campaigns', id: item.id }))).data;
              await api('/.netlify/functions/admin-save-campaign', { method: 'POST', body: { campaign: { ...detail.item, status: 'archived', publishStatus: 'archived', archiveReason: reason }, originalId: item.id, expectedUpdatedAt: detail.item.updatedAt || '', expectedEtag: detail.etag || '' } });
              toast(`${item.name} was archived.`, { tone: 'success' });
              load();
            }
          }) }
        ]
      });
      table.shell.append(pagination({ total: data.total, returned: (data.items || []).length, hasMore: data.hasMore, hasPrevious: previous.length > 0, onNext: () => { previous.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previous.pop() || ''; load(); } }));
      tableRegion.replaceChildren(table.shell);
    } catch (error) {
      tableRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Campaigns could not be loaded' }), el('p', { textContent: error.message })]));
      errorToast(error);
    } finally {
      loading = false;
    }
  }

  const actions = [];
  if (can(session, 'campaigns.write')) actions.push(button('New Campaign', { tone: 'primary', iconName: 'plus', onClick: () => campaignEditor({ session, id: '', refresh: load, initial: newCampaign() }).catch(errorToast) }));
  if (can(session, 'campaigns.export')) actions.push(button('Export', { tone: 'secondary', iconName: 'download', onClick: () => campaignExportDialog(filters) }));

  page.append(
    pageHeader({ title: 'Campaigns', description: 'Church inquiries, campaign content, imagery, dates, support formulas, pickup configuration, reporting, and publication.', actions }),
    el('div', { className: 'toolbar' }, [
      el('div', { className: 'toolbar-search' }, [icon('search'), searchInput]),
      el('div', { className: 'filter-actions' }, [statusSelect, fulfillmentSelect, button('More Filters', { tone: 'secondary', iconName: 'filter', className: 'filter-button', onClick: moreFilters })]),
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
