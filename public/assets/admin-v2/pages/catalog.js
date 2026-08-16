import { api, functionUrl } from '../api.js';
import { can } from '../permissions.js';
import { button, debounce, el, formatDate, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog } from '../ui/dialog.js';
import { mediaPickerButton, openMediaPicker } from '../ui/media-picker.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, filterChip, openDrawer, pageHeader } from './page-utils.js';

function newCollection() {
  const suffix = crypto.randomUUID().slice(0, 8).toLowerCase();
  return {
    id: `collection-${suffix}`,
    slug: `collection-${suffix}`,
    title: 'New Collection',
    shortTitle: 'New Collection',
    subtitle: '',
    description: '',
    status: 'draft',
    availabilityStatus: 'paused',
    displayOrder: 0,
    images: []
  };
}

async function collectionEditor({ session, id, refresh, initial = null }) {
  const detail = initial ? { item: initial, catalogRevision: null } : (await api(functionUrl('admin-detail', { resource: 'collections', id }))).data;
  const original = structuredClone(detail.item);
  const record = structuredClone(detail.item);
  let image = record.image || record.images?.[0] || null;
  const idInput = el('input', { type: 'text', value: record.id || '', readOnly: Boolean(original.createdAt), required: true });
  const titleInput = el('input', { type: 'text', value: record.title || '', required: true, maxLength: 200 });
  const shortInput = el('input', { type: 'text', value: record.shortTitle || '', maxLength: 160 });
  const slugInput = el('input', { type: 'text', value: record.slug || '', required: true, maxLength: 160 });
  const subtitleInput = el('input', { type: 'text', value: record.subtitle || '', maxLength: 300 });
  const descriptionInput = el('textarea', { rows: 7, maxLength: 8000 });
  descriptionInput.value = record.description || '';
  const orderInput = el('input', { type: 'number', min: '0', max: '10000', step: '1', value: Number(record.displayOrder || 0) });
  const statusSelect = el('select', {}, ['draft', 'review', 'published', 'archived'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: record.status === value })));
  const availabilitySelect = el('select', {}, ['paused', 'available', 'sold_out', 'retired'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: record.availabilityStatus === value })));
  const preview = el('div', { className: 'media-inspector-preview' });
  function renderImage() { preview.replaceChildren(image?.url ? el('img', { src: image.url, alt: image.alt || image.altText || '' }) : el('span', { textContent: 'No collection image selected' })); }
  renderImage();
  const form = el('form', {}, [
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Collection details' }),
      el('p', { textContent: 'Use headings and dividers rather than nested cards. Collection IDs remain immutable after creation.' }),
      el('div', { className: 'form-grid' }, [
        field('Collection ID', idInput), field('URL slug', slugInput), field('Title', titleInput), field('Short title', shortInput), field('Subtitle', subtitleInput, { span: 2 }), field('Storefront description', descriptionInput, { span: 2 }), field('Display order', orderInput), field('Publishing status', statusSelect), field('Availability', availabilitySelect)
      ])
    ]),
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Collection image' }),
      el('div', { className: 'split-workspace' }, [
        el('div', {}, mediaPickerButton({
          session,
          selectedId: image?.mediaId || image?.id || '',
          contextLabel: 'this collection',
          onSelect: (media) => {
            image = media ? { id: media.id, mediaId: media.id, url: media.thumbnailUrl, alt: media.altText, title: media.title } : null;
            renderImage();
          }
        })),
        preview
      ])
    ])
  ]);
  async function save(statusOverride = '') {
    if (!form.reportValidity()) return;
    Object.assign(record, {
      id: idInput.value.trim(), title: titleInput.value.trim(), shortTitle: shortInput.value.trim(), slug: slugInput.value.trim(), subtitle: subtitleInput.value.trim(), description: descriptionInput.value,
      displayOrder: Number(orderInput.value || 0), status: statusOverride || statusSelect.value, availabilityStatus: availabilitySelect.value,
      image, images: image ? [image, ...(record.images || []).slice(1)] : []
    });
    try {
      const { data } = await api('/.netlify/functions/admin-save-collection', { method: 'POST', body: { collection: record, originalId: original.createdAt ? original.id : '', expectedRevision: detail.catalogRevision } });
      Object.assign(record, data.collection);
      detail.catalogRevision = data.catalogRevision;
      toast(`${record.title} was saved.`, { tone: 'success' });
      await refresh();
    } catch (error) { errorToast(error, 'Collection could not be saved'); }
  }
  const sticky = el('div', { className: 'sticky-action-bar' }, [el('span', { className: 'field-help', textContent: `Catalog revision ${detail.catalogRevision ?? 'new'}` }), el('div', { className: 'page-actions' }, [button('Save Changes', { tone: 'secondary', onClick: () => save() }), can(session, 'catalog.collections.publish') ? button(record.status === 'published' ? 'Unpublish' : 'Publish', { tone: 'primary', onClick: () => save(record.status === 'published' ? 'draft' : 'published') }) : null])]);
  const { drawer } = openDrawer({ title: record.title || 'Collection editor', description: record.id, content: [form, sticky] });
  drawer.style.width = 'min(900px, 100vw)';
}

export async function renderCollections({ session }) {
  let search = '';
  let status = '';
  let availabilityStatus = '';
  let cursor = '';
  let nextCursor = '';
  const previous = [];
  const page = el('div', { className: 'page' });
  const tableRegion = el('div');
  const chips = el('div', { className: 'filter-chips' });
  const searchInput = el('input', { type: 'search', placeholder: 'Search collections…', 'aria-label': 'Search collections' });
  const statusSelect = el('select', { 'aria-label': 'Publishing status' }, [el('option', { value: '', textContent: 'Status' }), ...['draft', 'review', 'published', 'archived'].map((value) => el('option', { value, textContent: value }))]);
  const availabilitySelect = el('select', { 'aria-label': 'Availability' }, [el('option', { value: '', textContent: 'Availability' }), ...['available', 'paused', 'sold_out', 'retired'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' ') }))]);
  function reset() { cursor = ''; previous.length = 0; load(); }
  function renderChips() {
    chips.replaceChildren();
    if (status) chips.append(filterChip(`Status: ${status}`, () => { status = ''; statusSelect.value = ''; reset(); }));
    if (availabilityStatus) chips.append(filterChip(`Availability: ${availabilityStatus.replaceAll('_', ' ')}`, () => { availabilityStatus = ''; availabilitySelect.value = ''; reset(); }));
  }
  async function load() {
    renderChips();
    tableRegion.replaceChildren(dataTable({ columns: [{ label: 'Collection', value: 'title' }, { label: 'Status', value: 'status' }], loading: true, actions: true }).shell);
    try {
      const { data } = await api(functionUrl('admin-list', { resource: 'collections', search, status, availabilityStatus, cursor, limit: 25, sort: 'name-asc' }));
      nextCursor = data.nextCursor || '';
      const rows = (data.items || []).filter((item) => !availabilityStatus || item.availabilityStatus === availabilityStatus);
      const table = dataTable({ rows, caption: 'Collections', columns: [
        { label: 'Collection', value: 'title', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.title }), el('span', { className: 'table-secondary', textContent: item.slug || item.id })]) },
        { label: 'Products', value: 'productCount', numeric: true },
        { label: 'Display order', value: 'displayOrder', numeric: true },
        { label: 'Publishing', value: 'status', render: (value) => statusBadge(value) },
        { label: 'Availability', value: 'availabilityStatus', render: (value) => statusBadge(value) },
        { label: 'Modified', value: 'updatedAt', render: (value) => formatDate(value, { dateOnly: true }) }
      ], actions: (item) => [
        { label: 'Edit', onSelect: () => collectionEditor({ session, id: item.id, refresh: load }).catch(errorToast) },
        { label: 'Preview', onSelect: () => window.open(`/?preview=1&collection=${encodeURIComponent(item.id)}`, '_blank', 'noopener,noreferrer') },
        { label: item.status === 'published' ? 'Unpublish' : 'Publish', visible: can(session, 'catalog.collections.publish'), onSelect: async () => {
          const detail = (await api(functionUrl('admin-detail', { resource: 'collections', id: item.id }))).data;
          await api('/.netlify/functions/admin-save-collection', { method: 'POST', body: { collection: { ...detail.item, status: item.status === 'published' ? 'draft' : 'published' }, originalId: item.id, expectedRevision: detail.catalogRevision } });
          toast(`${item.title} was updated.`, { tone: 'success' }); load();
        } },
        { separator: true },
        { label: 'Archive', danger: true, visible: can(session, 'catalog.collections.publish') && item.status !== 'archived', onSelect: () => confirmDialog({ title: 'Archive Collection', description: 'Products and historical records remain; storefront visibility will be removed.', confirmLabel: 'Archive', tone: 'danger', requireReason: true, requireCheckbox: true, onConfirm: async ({ reason }) => {
          const detail = (await api(functionUrl('admin-detail', { resource: 'collections', id: item.id }))).data;
          await api('/.netlify/functions/admin-save-collection', { method: 'POST', body: { collection: { ...detail.item, status: 'archived', availabilityStatus: 'retired', archiveReason: reason }, originalId: item.id, expectedRevision: detail.catalogRevision } });
          toast(`${item.title} was archived.`, { tone: 'success' }); load();
        } }) }
      ] });
      table.shell.append(pagination({ total: data.total, returned: rows.length, hasMore: data.hasMore, hasPrevious: previous.length > 0, onNext: () => { previous.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previous.pop() || ''; load(); } }));
      tableRegion.replaceChildren(table.shell);
    } catch (error) { tableRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Collections could not be loaded' }), el('p', { textContent: error.message })])); errorToast(error); }
  }
  page.append(pageHeader({ title: 'Collections', description: 'Manage collection merchandising, display order, availability, and publication in a consistent table and editor.', actions: can(session, 'catalog.collections.write') ? [button('New Collection', { tone: 'primary', iconName: 'plus', onClick: () => collectionEditor({ session, id: '', refresh: load, initial: newCollection() }).catch(errorToast) })] : [] }), el('div', { className: 'toolbar' }, [el('div', { className: 'toolbar-search' }, [icon('search'), searchInput]), el('div', { className: 'filter-actions' }, [statusSelect, availabilitySelect])]), chips, tableRegion);
  searchInput.addEventListener('input', debounce(() => { search = searchInput.value.trim(); reset(); }, 300));
  statusSelect.addEventListener('change', () => { status = statusSelect.value; reset(); });
  availabilitySelect.addEventListener('change', () => { availabilityStatus = availabilitySelect.value; reset(); });
  await load();
  return page;
}

async function editMedia(session, item, refresh) {
  const detail = (await api(functionUrl('admin-detail', { resource: 'media', id: item.id }))).data.item;
  const titleInput = el('input', { type: 'text', value: detail.title || detail.filename || '', maxLength: 200 });
  const altInput = el('textarea', { rows: 4, maxLength: 500 }); altInput.value = detail.altText || detail.alt || '';
  const categoryInput = el('input', { type: 'text', value: detail.category || '', maxLength: 100 });
  const usageSelect = el('select', {}, ['draft', 'approved_for_site_use', 'restricted', 'archived'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: detail.usageStatus === value })));
  const rightsSelect = el('select', {}, ['unknown', 'cleared', 'restricted', 'expired'].map((value) => el('option', { value, textContent: value, selected: detail.rightsStatus === value })));
  const accuracySelect = el('select', {}, ['not_applicable', 'pending', 'confirmed', 'rejected'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' '), selected: detail.productAccuracyStatus === value })));
  const orientationSelect = el('select', {}, ['unknown', 'landscape', 'portrait', 'square'].map((value) => el('option', { value, textContent: value, selected: detail.orientation === value })));
  const notesInput = el('textarea', { rows: 5, maxLength: 2000 }); notesInput.value = detail.notes || '';
  const form = el('form', { className: 'form-grid' }, [field('Title', titleInput), field('Category', categoryInput), field('Alt text', altInput, { span: 2 }), field('Usage status', usageSelect), field('Rights status', rightsSelect), field('Product accuracy', accuracySelect), field('Orientation', orientationSelect), field('Internal notes', notesInput, { span: 2 })]);
  const { drawer } = openDrawer({ title: detail.title || detail.filename || detail.id, description: `${detail.contentType || 'media'} · ${detail.width || 0} × ${detail.height || 0}`, content: [detail.url || detail.thumbnailUrl ? el('div', { className: 'media-inspector-preview' }, el('img', { src: detail.url || detail.thumbnailUrl, alt: detail.altText || '' })) : null, form], footer: el('div', { className: 'page-actions' }, [button('Save Changes', { tone: 'primary', onClick: async () => {
    if (!form.reportValidity()) return;
    try {
      await api('/.netlify/functions/admin-update-media', { method: 'POST', body: { id: detail.id, expectedUpdatedAt: detail.updatedAt, metadata: { title: titleInput.value.trim(), alt: altInput.value.trim(), category: categoryInput.value.trim(), usageStatus: usageSelect.value, rightsStatus: rightsSelect.value, productAccuracyStatus: accuracySelect.value, orientation: orientationSelect.value, notes: notesInput.value } } });
      toast('Media metadata was saved.', { tone: 'success' }); refresh();
    } catch (error) { errorToast(error, 'Media could not be updated'); }
  } })]) });
  drawer.style.width = 'min(820px, 100vw)';
}

export async function renderMedia({ session }) {
  let search = '';
  let status = '';
  let rightsStatus = '';
  let productAccuracyStatus = '';
  let orientation = '';
  let cursor = '';
  let nextCursor = '';
  const previous = [];
  const page = el('div', { className: 'page' });
  const gridRegion = el('div');
  const chips = el('div', { className: 'filter-chips' });
  const searchInput = el('input', { type: 'search', placeholder: 'Search media…', 'aria-label': 'Search media' });
  const usageSelect = el('select', { 'aria-label': 'Usage status' }, [el('option', { value: '', textContent: 'Usage status' }), ...['draft', 'approved_for_site_use', 'restricted', 'archived'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' ') }))]);
  const rightsSelect = el('select', { 'aria-label': 'Rights status' }, [el('option', { value: '', textContent: 'Rights status' }), ...['unknown', 'cleared', 'restricted', 'expired'].map((value) => el('option', { value, textContent: value }))]);
  const accuracySelect = el('select', { 'aria-label': 'Product accuracy' }, [el('option', { value: '', textContent: 'Product accuracy' }), ...['not_applicable', 'pending', 'confirmed', 'rejected'].map((value) => el('option', { value, textContent: value.replaceAll('_', ' ') }))]);
  const orientationSelect = el('select', { 'aria-label': 'Orientation' }, [el('option', { value: '', textContent: 'Orientation' }), ...['landscape', 'portrait', 'square', 'unknown'].map((value) => el('option', { value, textContent: value }))]);
  function reset() { cursor = ''; previous.length = 0; load(); }
  function renderChips() {
    chips.replaceChildren();
    const values = [[status, 'Usage', () => { status = ''; usageSelect.value = ''; reset(); }], [rightsStatus, 'Rights', () => { rightsStatus = ''; rightsSelect.value = ''; reset(); }], [productAccuracyStatus, 'Accuracy', () => { productAccuracyStatus = ''; accuracySelect.value = ''; reset(); }], [orientation, 'Orientation', () => { orientation = ''; orientationSelect.value = ''; reset(); }]];
    for (const [value, label, remove] of values) if (value) chips.append(filterChip(`${label}: ${value.replaceAll('_', ' ')}`, remove));
  }
  async function load() {
    renderChips();
    gridRegion.replaceChildren(el('div', { className: 'media-grid' }, Array.from({ length: 10 }, () => el('div', { className: 'media-card' }, [el('div', { className: 'media-thumb' }), el('div', { className: 'media-card-copy' }, el('span', { className: 'skeleton' }))]))));
    try {
      const { data } = await api(functionUrl('admin-list', { resource: 'media', search, status, rightsStatus, productAccuracyStatus, orientation, cursor, limit: 30 }));
      nextCursor = data.nextCursor || '';
      const rows = (data.items || []).filter((item) => (!rightsStatus || item.rightsStatus === rightsStatus) && (!productAccuracyStatus || item.productAccuracyStatus === productAccuracyStatus) && (!orientation || item.orientation === orientation));
      const grid = el('div', { className: 'media-grid' });
      for (const item of rows) {
        const card = el('article', { className: 'media-card', tabindex: '0', role: can(session, 'media.manage') ? 'button' : undefined }, [
          el('div', { className: 'media-thumb' }, item.thumbnailUrl ? el('img', { src: item.thumbnailUrl, alt: item.altText || '' }) : el('span', { textContent: 'No preview' })),
          el('span', { className: 'media-eligibility' }, statusBadge(item.usageStatus || 'unknown')),
          el('div', { className: 'media-card-copy' }, [el('strong', { textContent: item.title || item.filename || item.id }), el('span', { textContent: item.altText || 'No alt text' }), el('span', { textContent: `${item.rightsStatus || 'unknown rights'} · ${formatDate(item.createdAt, { dateOnly: true })}` })])
        ]);
        if (can(session, 'media.manage')) {
          card.addEventListener('click', () => editMedia(session, item, load).catch(errorToast));
          card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editMedia(session, item, load).catch(errorToast); } });
        }
        grid.append(card);
      }
      if (!rows.length) grid.append(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'No media found' }), el('p', { textContent: 'Adjust the search or filters.' })]));
      const footer = pagination({ total: data.total, returned: rows.length, hasMore: data.hasMore, hasPrevious: previous.length > 0, onNext: () => { previous.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previous.pop() || ''; load(); } });
      gridRegion.replaceChildren(grid, footer);
    } catch (error) { gridRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Media could not be loaded' }), el('p', { textContent: error.message })])); errorToast(error); }
  }
  page.append(pageHeader({ title: 'Media Library', description: 'Search bounded thumbnail pages, review rights and product accuracy, and load full assets only when opened.', actions: can(session, 'media.upload') ? [button('Upload New', { tone: 'primary', iconName: 'upload', onClick: () => openMediaPicker({ session, contextLabel: 'the Media Library', allowClear: false, eligibility: () => ({ eligible: true, reason: '' }), onSelect: () => {} }) })] : [] }), el('div', { className: 'toolbar' }, [el('div', { className: 'toolbar-search' }, [icon('search'), searchInput]), el('div', { className: 'filter-actions' }, [usageSelect, rightsSelect, accuracySelect, orientationSelect])]), chips, gridRegion);
  searchInput.addEventListener('input', debounce(() => { search = searchInput.value.trim(); reset(); }, 300));
  usageSelect.addEventListener('change', () => { status = usageSelect.value; reset(); });
  rightsSelect.addEventListener('change', () => { rightsStatus = rightsSelect.value; reset(); });
  accuracySelect.addEventListener('change', () => { productAccuracyStatus = accuracySelect.value; reset(); });
  orientationSelect.addEventListener('change', () => { orientation = orientationSelect.value; reset(); });
  await load();
  return page;
}
