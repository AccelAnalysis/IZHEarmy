import { api, functionUrl } from '../api.js';
import { can } from '../permissions.js';
import { setNavigationGuard } from '../router.js';
import { button, debounce, el, formatDate, formatMoney, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog, createDialog } from '../ui/dialog.js';
import { mediaPickerButton } from '../ui/media-picker.js';
import { dataTable, pagination } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, filterChip, openDrawer, pageHeader } from './page-utils.js';

function collectionName(collections, id) {
  return collections.find((collection) => collection.id === id)?.title || id || 'Unassigned';
}

function editorImage(product) {
  return (product.images || [])[0] || null;
}

async function loadCollections() {
  const { data } = await api(functionUrl('admin-list', { resource: 'collections', limit: 100, sort: 'name-asc' }));
  return data.items || [];
}

function createProductDraft(collections) {
  const suffix = crypto.randomUUID().slice(0, 8).toLowerCase();
  return {
    id: `product-${suffix}`,
    collectionId: collections[0]?.id || '',
    name: 'New Product',
    shortName: 'New Product',
    description: '',
    productType: 'apparel',
    sku: `DRAFT-${suffix.toUpperCase()}`,
    lookupKey: `draft_product_${suffix}`,
    unitAmount: 0,
    currency: 'usd',
    giveOneEligible: false,
    giveOneGiftUnit: 1,
    status: 'draft',
    availabilityStatus: 'paused',
    images: [],
    variants: []
  };
}

async function duplicateProduct({ product, collections, refresh, openEditor }) {
  const collectionSelect = el('select');
  for (const collection of collections) collectionSelect.append(el('option', { value: collection.id, textContent: collection.title || collection.id, selected: collection.id === product.collectionId }));
  const content = el('div', {}, [
    el('p', { textContent: `Source product: ${product.name || product.id}` }),
    field('Target collection', collectionSelect, { help: 'Merchandising content, media, audience settings, Give One settings, and variant structure are copied.' }),
    el('p', { className: 'field-help', textContent: 'Product ID, product SKU, Stripe lookup key, variant IDs, variant SKUs, publication history, and operational relationships are reset or regenerated. The duplicate will be draft and paused.' })
  ]);
  createDialog({
    title: 'Duplicate Product',
    description: 'Create a safe draft copy without reusing live commerce identifiers.',
    content,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      {
        label: 'Duplicate',
        tone: 'primary',
        icon: 'duplicate',
        onClick: async ({ dialog, footer }) => {
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
          try {
            const { data } = await api('/.netlify/functions/admin-duplicate-product', {
              method: 'POST',
              body: { sourceId: product.id, targetCollectionId: collectionSelect.value, expectedRevision: product.catalogRevision }
            });
            toast(`${data.product.name} was created as a paused draft.`, { title: 'Product duplicated', tone: 'success' });
            dialog.close('duplicated');
            await refresh();
            await openEditor(data.product.id);
          } catch (error) {
            errorToast(error, 'Product could not be duplicated');
            [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
          }
        }
      }
    ]
  });
}

async function productEditor({ session, id, collections, refresh, initialProduct = null }) {
  let detail = initialProduct ? { item: initialProduct, catalogRevision: initialProduct.catalogRevision ?? null, etag: '' } : null;
  if (!detail) {
    const response = await api(functionUrl('admin-detail', { resource: 'products', id }));
    detail = response.data;
  }
  const original = structuredClone(detail.item);
  const product = structuredClone(detail.item);
  let dirty = false;
  let saving = false;

  const idInput = el('input', { type: 'text', value: product.id || '', maxLength: 120, readOnly: Boolean(original.createdAt) });
  const nameInput = el('input', { type: 'text', value: product.name || '', maxLength: 220, required: true });
  const shortNameInput = el('input', { type: 'text', value: product.shortName || '', maxLength: 160, required: true });
  const collectionSelect = el('select', { required: true });
  for (const collection of collections) collectionSelect.append(el('option', { value: collection.id, textContent: collection.title || collection.id, selected: collection.id === product.collectionId }));
  const typeInput = el('input', { type: 'text', value: product.productType || '', maxLength: 80, required: true });
  const descriptionInput = el('textarea', { rows: 6, maxLength: 8_000, value: product.description || '' });
  descriptionInput.value = product.description || '';
  const priceInput = el('input', { type: 'number', min: '0', step: '0.01', value: (Number(product.unitAmount || 0) / 100).toFixed(2), required: true });
  const skuInput = el('input', { type: 'text', value: product.sku || '', maxLength: 120, required: true });
  const lookupInput = el('input', { type: 'text', value: product.lookupKey || '', maxLength: 180, required: true });
  const statusSelect = el('select', {}, [
    el('option', { value: 'draft', textContent: 'Draft', selected: product.status === 'draft' }),
    el('option', { value: 'review', textContent: 'Review', selected: product.status === 'review' }),
    el('option', { value: 'published', textContent: 'Published', selected: product.status === 'published' }),
    el('option', { value: 'archived', textContent: 'Archived', selected: product.status === 'archived' })
  ]);
  const availabilitySelect = el('select', {}, [
    el('option', { value: 'paused', textContent: 'Paused', selected: product.availabilityStatus === 'paused' }),
    el('option', { value: 'available', textContent: 'Available', selected: product.availabilityStatus === 'available' }),
    el('option', { value: 'sold_out', textContent: 'Sold out', selected: product.availabilityStatus === 'sold_out' }),
    el('option', { value: 'retired', textContent: 'Retired', selected: product.availabilityStatus === 'retired' })
  ]);
  const giveOneInput = el('input', { type: 'checkbox', checked: Boolean(product.giveOneEligible) });
  const giftUnitInput = el('input', { type: 'number', min: '1', max: '100', step: '1', value: Number(product.giveOneGiftUnit || 1) });
  const imagePreview = el('div', { className: 'media-inspector-preview' });
  const imageMeta = el('p', { className: 'field-help' });

  function renderImage() {
    const image = editorImage(product);
    imagePreview.replaceChildren(image?.url ? el('img', { src: image.url, alt: image.alt || image.altText || '' }) : el('span', { textContent: 'No product image selected' }));
    imageMeta.textContent = image ? `Selected media: ${image.title || image.filename || image.mediaId || image.id || image.url}` : 'Use the shared Media Library picker to assign an approved product image.';
  }
  renderImage();

  const form = el('form', {}, [
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Product identity' }),
      el('p', { textContent: 'Product IDs are immutable after creation. Stripe lookup keys and SKUs remain server-validated.' }),
      el('div', { className: 'form-grid' }, [
        field('Product ID', idInput),
        field('Collection', collectionSelect),
        field('Product name', nameInput),
        field('Short name', shortNameInput),
        field('Product type', typeInput),
        field('SKU', skuInput),
        field('Stripe lookup key', lookupInput, { help: 'Draft duplicates receive regenerated non-live identifiers.' }),
        field('Price', priceInput, { help: 'Displayed in dollars; stored and validated in cents.' }),
        field('Description', descriptionInput, { span: 2 })
      ])
    ]),
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Publishing and availability' }),
      el('p', { textContent: 'Publishing actions require separate server-side publishing permission.' }),
      el('div', { className: 'form-grid' }, [
        field('Publishing status', statusSelect),
        field('Availability', availabilitySelect),
        el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Give One eligibility' }), el('label', {}, [giveOneInput, ' Eligible for Give One'])]),
        field('Gift units per purchase', giftUnitInput)
      ])
    ]),
    el('section', { className: 'form-section' }, [
      el('h3', { textContent: 'Primary image' }),
      el('p', { textContent: 'The same Media Library action and eligibility vocabulary are used throughout Admin v2.' }),
      el('div', { className: 'split-workspace' }, [
        el('div', {}, [
          mediaPickerButton({
            session,
            selectedId: editorImage(product)?.mediaId || editorImage(product)?.id || '',
            contextLabel: 'this product',
            eligibility: (media) => {
              const usage = media.usageStatus === 'approved_for_site_use';
              const rights = media.rightsStatus === 'cleared';
              const accurate = !media.productAccuracyStatus || media.productAccuracyStatus === 'confirmed';
              return { eligible: usage && rights && accurate, reason: !usage ? 'This asset is not approved for site use.' : !rights ? 'Rights clearance is incomplete.' : !accurate ? 'Product accuracy has not been confirmed.' : '' };
            },
            onSelect: (media) => {
              product.images = media ? [{
                ...(editorImage(product) || {}),
                id: media.id,
                mediaId: media.id,
                url: media.thumbnailUrl,
                alt: media.altText,
                title: media.title,
                filename: media.filename
              }, ...(product.images || []).slice(1)] : [];
              dirty = true;
              renderImage();
              renderDirty();
            }
          }),
          imageMeta
        ]),
        imagePreview
      ])
    ])
  ]);

  function collect() {
    Object.assign(product, {
      id: idInput.value.trim(),
      collectionId: collectionSelect.value,
      name: nameInput.value.trim(),
      shortName: shortNameInput.value.trim(),
      description: descriptionInput.value,
      productType: typeInput.value.trim(),
      sku: skuInput.value.trim(),
      lookupKey: lookupInput.value.trim(),
      unitAmount: Math.round(Number(priceInput.value || 0) * 100),
      currency: product.currency || 'usd',
      status: statusSelect.value,
      availabilityStatus: availabilitySelect.value,
      giveOneEligible: giveOneInput.checked,
      giveOneGiftUnit: Number(giftUnitInput.value || 1)
    });
    return product;
  }

  const dirtyLabel = el('span', { className: 'unsaved-indicator', textContent: 'No unsaved changes' });
  function renderDirty() {
    dirtyLabel.textContent = dirty ? 'Unsaved changes' : 'All changes saved';
    dirtyLabel.style.color = dirty ? 'var(--warning)' : 'var(--success)';
  }
  renderDirty();
  for (const control of form.querySelectorAll('input, select, textarea')) control.addEventListener('input', () => { dirty = true; renderDirty(); });

  async function save(statusOverride = '') {
    if (saving) return;
    if (!form.reportValidity()) return;
    saving = true;
    const next = collect();
    if (statusOverride) next.status = statusOverride;
    try {
      const { data } = await api('/.netlify/functions/admin-save-product', {
        method: 'POST',
        body: { product: next, originalId: original.createdAt ? original.id : '', expectedRevision: detail.catalogRevision }
      });
      Object.assign(product, data.product);
      detail.catalogRevision = data.catalogRevision;
      dirty = false;
      renderDirty();
      toast(`${product.name} was saved.`, { title: 'Product saved', tone: 'success' });
      await refresh();
    } catch (error) {
      errorToast(error, 'Product could not be saved');
    } finally {
      saving = false;
    }
  }

  const actions = el('div', { className: 'sticky-action-bar' }, [
    dirtyLabel,
    el('div', { className: 'page-actions' }, [
      button('Save Changes', { tone: 'secondary', onClick: () => save() }),
      can(session, 'catalog.products.publish') ? button(product.status === 'published' ? 'Unpublish' : 'Publish', { tone: 'primary', onClick: () => save(product.status === 'published' ? 'draft' : 'published') }) : null
    ])
  ]);
  const { drawer, close } = openDrawer({ title: product.name || 'Product editor', description: `${product.id} · ${collectionName(collections, product.collectionId)}`, content: [form, actions] });
  drawer.style.width = 'min(980px, 100vw)';

  const previousOnBeforeUnload = window.onbeforeunload;
  window.onbeforeunload = () => dirty ? 'You have unsaved product changes.' : undefined;
  setNavigationGuard(() => dirty ? window.confirm('Discard unsaved product changes and leave this page?') : true);
  const observer = new MutationObserver(() => {
    if (!drawer.isConnected) {
      window.onbeforeunload = previousOnBeforeUnload;
      setNavigationGuard(null);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
  return { close };
}

export async function renderProducts({ session }) {
  const collections = await loadCollections();
  let search = '';
  let status = '';
  let collectionId = '';
  let availabilityStatus = '';
  let productType = '';
  let cursor = '';
  let nextCursor = '';
  let previousCursors = [];
  let loading = false;
  const page = el('div', { className: 'page' });
  const tableRegion = el('div');
  const chips = el('div', { className: 'filter-chips' });
  const searchInput = el('input', { type: 'search', placeholder: 'Search products…', 'aria-label': 'Search products' });
  const statusSelect = el('select', { 'aria-label': 'Publishing status' }, [
    el('option', { value: '', textContent: 'Status' }), el('option', { value: 'draft', textContent: 'Draft' }), el('option', { value: 'review', textContent: 'Review' }), el('option', { value: 'published', textContent: 'Published' }), el('option', { value: 'archived', textContent: 'Archived' })
  ]);
  const collectionSelect = el('select', { 'aria-label': 'Collection' }, [el('option', { value: '', textContent: 'Collection' }), ...collections.map((collection) => el('option', { value: collection.id, textContent: collection.title || collection.id }))]);
  const availabilitySelect = el('select', { 'aria-label': 'Availability' }, [
    el('option', { value: '', textContent: 'Availability' }), el('option', { value: 'available', textContent: 'Available' }), el('option', { value: 'paused', textContent: 'Paused' }), el('option', { value: 'sold_out', textContent: 'Sold out' }), el('option', { value: 'retired', textContent: 'Retired' })
  ]);
  const typeInput = el('input', { type: 'text', placeholder: 'Product type', 'aria-label': 'Product type filter' });

  async function openEditor(id, initialProduct = null) {
    try { await productEditor({ session, id, collections, refresh: load, initialProduct }); }
    catch (error) { errorToast(error, 'Product editor could not be opened'); }
  }

  function renderChips() {
    chips.replaceChildren();
    const values = [
      status ? ['Status', status, () => { status = ''; statusSelect.value = ''; reset(); }] : null,
      collectionId ? ['Collection', collectionName(collections, collectionId), () => { collectionId = ''; collectionSelect.value = ''; reset(); }] : null,
      availabilityStatus ? ['Availability', availabilityStatus, () => { availabilityStatus = ''; availabilitySelect.value = ''; reset(); }] : null,
      productType ? ['Type', productType, () => { productType = ''; typeInput.value = ''; reset(); }] : null
    ].filter(Boolean);
    for (const [label, value, remove] of values) chips.append(filterChip(`${label}: ${String(value).replaceAll('_', ' ')}`, remove));
  }

  function reset() { cursor = ''; nextCursor = ''; previousCursors = []; load(); }

  async function load() {
    if (loading) return;
    loading = true;
    tableRegion.replaceChildren(dataTable({ columns: [{ label: 'Product', value: 'name' }, { label: 'Status', value: 'status' }, { label: 'Collection', value: 'collectionId' }], loading: true, actions: true }).shell);
    renderChips();
    try {
      const { data } = await api(functionUrl('admin-list', { resource: 'products', search, status, collectionId, availabilityStatus, productType, cursor, limit: 25, sort: 'updated-desc' }));
      nextCursor = data.nextCursor || '';
      const rows = (data.items || []).filter((item) => (!availabilityStatus || item.availabilityStatus === availabilityStatus) && (!productType || String(item.productType || '').toLowerCase().includes(productType.toLowerCase())));
      const table = dataTable({
        caption: 'Products',
        rows,
        columns: [
          { label: 'Product', value: 'name', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.name }), el('span', { className: 'table-secondary', textContent: `${item.sku || 'No SKU'} · ${item.productType || 'Unspecified type'}` })]) },
          { label: 'Collection', value: 'collectionId', render: (value) => collectionName(collections, value) },
          { label: 'Price', value: 'unitAmount', numeric: true, render: (value, item) => formatMoney(value, item.currency) },
          { label: 'Publishing', value: 'status', render: (value) => statusBadge(value) },
          { label: 'Availability', value: 'availabilityStatus', render: (value) => statusBadge(value) },
          { label: 'Modified', value: 'updatedAt', render: (value) => formatDate(value, { dateOnly: true }) }
        ],
        actions: (item) => [
          { label: 'Edit', onSelect: () => openEditor(item.id) },
          { label: 'Preview', onSelect: () => window.open(`/?preview=1&product=${encodeURIComponent(item.id)}`, '_blank', 'noopener,noreferrer') },
          { label: 'Duplicate', visible: can(session, 'catalog.products.duplicate'), onSelect: () => duplicateProduct({ product: { ...item, catalogRevision: data.catalogRevision }, collections, refresh: load, openEditor }) },
          { separator: true },
          { label: item.status === 'published' ? 'Unpublish' : 'Publish', visible: can(session, 'catalog.products.publish'), onSelect: async () => {
            const detail = await api(functionUrl('admin-detail', { resource: 'products', id: item.id }));
            const product = { ...detail.data.item, status: item.status === 'published' ? 'draft' : 'published' };
            try {
              await api('/.netlify/functions/admin-save-product', { method: 'POST', body: { product, originalId: product.id, expectedRevision: detail.data.catalogRevision } });
              toast(`${product.name} is now ${product.status}.`, { tone: 'success' });
              load();
            } catch (error) { errorToast(error); }
          } },
          { label: 'Archive', danger: true, visible: can(session, 'catalog.products.publish') && item.status !== 'archived', onSelect: () => confirmDialog({ title: 'Archive Product', description: `${item.name} will be removed from active merchandising while historical records remain intact.`, confirmLabel: 'Archive', tone: 'danger', requireReason: true, requireCheckbox: true, onConfirm: async ({ reason }) => {
            const detail = await api(functionUrl('admin-detail', { resource: 'products', id: item.id }));
            await api('/.netlify/functions/admin-save-product', { method: 'POST', body: { product: { ...detail.data.item, status: 'archived', availabilityStatus: 'retired', archiveReason: reason }, originalId: item.id, expectedRevision: detail.data.catalogRevision } });
            toast(`${item.name} was archived.`, { tone: 'success' });
            load();
          } }) }
        ]
      });
      table.shell.append(pagination({ total: data.total, returned: rows.length, hasMore: data.hasMore, hasPrevious: previousCursors.length > 0, onNext: () => { previousCursors.push(cursor); cursor = nextCursor; load(); }, onPrevious: () => { cursor = previousCursors.pop() || ''; load(); } }));
      tableRegion.replaceChildren(table.shell);
    } catch (error) {
      tableRegion.replaceChildren(el('div', { className: 'empty-state table-shell' }, [el('h3', { textContent: 'Products could not be loaded' }), el('p', { textContent: error.message })]));
      errorToast(error);
    } finally { loading = false; }
  }

  page.append(
    pageHeader({
      title: 'Products',
      description: 'Search, review, duplicate, and edit products in a full-width workspace. Live publication remains separately authorized.',
      actions: can(session, 'catalog.products.write') ? [button('New Product', { tone: 'primary', iconName: 'plus', onClick: () => {
        const draft = createProductDraft(collections);
        productEditor({ session, id: draft.id, collections, refresh: load, initialProduct: draft }).catch((error) => errorToast(error));
      } })] : []
    }),
    el('div', { className: 'toolbar' }, [
      el('div', { className: 'toolbar-search' }, [icon('search'), searchInput]),
      el('div', { className: 'filter-actions' }, [statusSelect, collectionSelect, availabilitySelect, typeInput])
    ]),
    chips,
    tableRegion
  );

  searchInput.addEventListener('input', debounce(() => { search = searchInput.value.trim(); reset(); }, 300));
  statusSelect.addEventListener('change', () => { status = statusSelect.value; reset(); });
  collectionSelect.addEventListener('change', () => { collectionId = collectionSelect.value; reset(); });
  availabilitySelect.addEventListener('change', () => { availabilityStatus = availabilitySelect.value; reset(); });
  typeInput.addEventListener('input', debounce(() => { productType = typeInput.value.trim(); reset(); }, 300));
  await load();
  return page;
}
