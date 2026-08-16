import { api, functionUrl } from '../api.js';
import { can } from '../permissions.js';
import { button, debounce, el, formatDate, statusBadge } from './dom.js';
import { createDialog } from './dialog.js';
import { errorToast, toast } from './toast.js';

const ACTION_LABEL = 'Choose from Media Library';

function defaultEligibility(media) {
  const approved = media.usageStatus === 'approved_for_site_use';
  const rights = media.rightsStatus === 'cleared';
  return {
    eligible: approved && rights,
    reason: !approved ? 'This asset is not approved for site use.' : !rights ? 'Rights clearance is incomplete.' : ''
  };
}

async function uploadMedia(session, onUploaded) {
  const fileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', required: true });
  const titleInput = el('input', { type: 'text', maxLength: 160 });
  const altInput = el('textarea', { maxLength: 500, rows: 3, required: true });
  const form = el('form', { className: 'form-grid' }, [
    el('div', { className: 'field span-2' }, [el('label', { textContent: 'Image file' }), fileInput, el('span', { className: 'field-help', textContent: 'JPEG, PNG, or WebP. Files are signature-validated, sanitized, and quarantined before release.' })]),
    el('div', { className: 'field span-2' }, [el('label', { textContent: 'Title' }), titleInput]),
    el('div', { className: 'field span-2' }, [el('label', { textContent: 'Alt text' }), altInput])
  ]);
  createDialog({
    title: 'Upload New',
    description: can(session, 'media.manage') ? 'New assets remain drafts until their usage, rights, and product-accuracy review is complete.' : 'New assets are uploaded as drafts for later review.',
    content: form,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      {
        label: 'Upload New',
        tone: 'primary',
        icon: 'upload',
        onClick: async ({ dialog, footer }) => {
          if (!fileInput.files?.[0] || !altInput.value.trim()) { form.reportValidity(); return; }
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
          try {
            const data = new FormData();
            data.set('file', fileInput.files[0]);
            data.set('title', titleInput.value.trim());
            data.set('alt', altInput.value.trim());
            data.set('usageStatus', 'draft');
            const { data: payload } = await api('/.netlify/functions/admin-upload-media', { method: 'POST', body: data });
            toast('The image passed validation and was added to the Media Library as a draft.', { title: 'Upload complete', tone: 'success' });
            dialog.close('uploaded');
            onUploaded?.(payload.media);
          } catch (error) {
            errorToast(error, 'Upload failed');
            [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
          }
        }
      }
    ]
  });
}

export function mediaPickerButton({
  session,
  selectedId = '',
  onSelect,
  eligibility = defaultEligibility,
  contextLabel = 'this field',
  allowClear = true,
  className = ''
} = {}) {
  return button(ACTION_LABEL, {
    tone: 'secondary',
    iconName: 'media',
    className,
    disabled: !can(session, 'media.read'),
    onClick: () => openMediaPicker({ session, selectedId, onSelect, eligibility, contextLabel, allowClear })
  });
}

export function openMediaPicker({
  session,
  selectedId = '',
  onSelect,
  eligibility = defaultEligibility,
  contextLabel = 'this field',
  allowClear = true
} = {}) {
  let selected = null;
  let cursor = '';
  let nextCursor = '';
  let previousCursors = [];
  let search = '';
  let status = '';
  let loading = false;

  const searchInput = el('input', { type: 'search', placeholder: 'Search approved media…', 'aria-label': 'Search Media Library' });
  const statusSelect = el('select', { 'aria-label': 'Filter media by usage status' }, [
    el('option', { value: '', textContent: 'All usage statuses' }),
    el('option', { value: 'approved_for_site_use', textContent: 'Approved for site use' }),
    el('option', { value: 'draft', textContent: 'Draft' }),
    el('option', { value: 'archived', textContent: 'Archived' })
  ]);
  const grid = el('div', { className: 'media-grid', role: 'listbox', 'aria-label': 'Media Library results' });
  const inspector = el('aside', { className: 'media-inspector', 'aria-live': 'polite' });
  const pagination = el('div', { className: 'pagination' });
  const results = el('div', { className: 'media-picker-results' }, [
    el('div', { className: 'toolbar' }, [el('div', { className: 'toolbar-search' }, searchInput), statusSelect]),
    grid,
    pagination
  ]);
  const layout = el('div', { className: 'media-picker-layout' }, [results, inspector]);

  function renderInspector() {
    inspector.replaceChildren();
    if (!selected) {
      inspector.append(el('h3', { textContent: 'No asset selected' }), el('p', { className: 'field-help', textContent: `Select an eligible asset for ${contextLabel}.` }));
      return;
    }
    const rule = eligibility(selected);
    const preview = el('div', { className: 'media-inspector-preview' }, selected.thumbnailUrl
      ? el('img', { src: selected.thumbnailUrl, alt: selected.altText || '' })
      : el('span', { textContent: 'No preview' }));
    inspector.append(
      preview,
      el('h3', { textContent: selected.title || selected.filename || selected.id }),
      statusBadge(rule.eligible ? 'approved' : 'warning', rule.eligible ? 'Eligible' : 'Not eligible'),
      rule.reason ? el('p', { className: 'field-error', textContent: rule.reason }) : null,
      el('p', { className: 'field-help', textContent: selected.altText ? `Alt text: ${selected.altText}` : 'Alt text is not yet available.' }),
      el('p', { className: 'field-help', textContent: `Usage: ${selected.usageStatus || 'unknown'} · Rights: ${selected.rightsStatus || 'unknown'} · Uploaded: ${formatDate(selected.createdAt, { dateOnly: true })}` })
    );
  }

  function renderPagination() {
    pagination.replaceChildren(
      el('span', { className: 'pagination-summary', textContent: 'Media is loaded in bounded pages.' }),
      el('div', { className: 'pagination-actions' }, [
        button('Previous', { tone: 'secondary', disabled: !previousCursors.length || loading, onClick: () => {
          cursor = previousCursors.pop() || '';
          load();
        } }),
        button('Next', { tone: 'secondary', disabled: !nextCursor || loading, onClick: () => {
          previousCursors.push(cursor);
          cursor = nextCursor;
          load();
        } })
      ])
    );
  }

  async function load() {
    loading = true;
    grid.setAttribute('aria-busy', 'true');
    grid.replaceChildren(...Array.from({ length: 8 }, () => el('div', { className: 'media-card', 'aria-hidden': 'true' }, [el('div', { className: 'media-thumb' }), el('div', { className: 'media-card-copy' }, el('span', { className: 'skeleton' }))])));
    renderPagination();
    try {
      const { data } = await api(functionUrl('admin-list', { resource: 'media', search, status, cursor, limit: 24 }));
      nextCursor = data.nextCursor || '';
      grid.replaceChildren();
      for (const media of data.items || []) {
        const rule = eligibility(media);
        const card = el('button', {
          type: 'button',
          className: 'media-card',
          role: 'option',
          'aria-selected': media.id === selected?.id ? 'true' : 'false',
          dataset: { mediaId: media.id },
          on: {
            click: () => {
              selected = media;
              for (const other of grid.querySelectorAll('[role="option"]')) other.setAttribute('aria-selected', other.dataset.mediaId === media.id ? 'true' : 'false');
              renderInspector();
            }
          }
        }, [
          el('div', { className: 'media-thumb' }, media.thumbnailUrl ? el('img', { src: media.thumbnailUrl, alt: '' }) : el('span', { textContent: 'No preview' })),
          el('span', { className: 'media-eligibility' }, statusBadge(rule.eligible ? 'approved' : 'warning', rule.eligible ? 'Eligible' : 'Restricted')),
          el('span', { className: 'media-card-copy' }, [
            el('strong', { textContent: media.title || media.filename || media.id }),
            el('span', { textContent: media.altText || 'No alt text' })
          ])
        ]);
        grid.append(card);
        if (media.id === selectedId) selected = media;
      }
      if (!(data.items || []).length) grid.append(el('div', { className: 'empty-state' }, [el('h3', { textContent: 'No media found' }), el('p', { textContent: 'Adjust the search or usage-status filter.' })]));
      renderInspector();
      renderPagination();
    } catch (error) {
      grid.replaceChildren(el('div', { className: 'empty-state' }, [el('h3', { textContent: 'Media could not be loaded' }), el('p', { textContent: error.message })]));
      errorToast(error);
    } finally {
      loading = false;
      grid.removeAttribute('aria-busy');
      renderPagination();
    }
  }

  const modal = createDialog({
    title: 'Media Library',
    description: `Choose an existing asset for ${contextLabel}. Approval and eligibility remain visible inside the picker.`,
    wide: true,
    content: layout,
    actions: [
      ...(can(session, 'media.upload') ? [{ label: 'Upload New', tone: 'secondary', icon: 'upload', onClick: () => uploadMedia(session, () => { cursor = ''; previousCursors = []; load(); }) }] : []),
      ...(allowClear ? [{ label: 'Clear Selection', tone: 'quiet', onClick: ({ dialog }) => { onSelect?.(null); dialog.close('cleared'); } }] : []),
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      {
        label: 'Use Selected Media',
        tone: 'primary',
        onClick: ({ dialog }) => {
          if (!selected) { toast('Select a Media Library asset first.', { tone: 'warning' }); return false; }
          const rule = eligibility(selected);
          if (!rule.eligible) { toast(rule.reason || 'This asset is not eligible in the current context.', { title: 'Asset cannot be selected', tone: 'warning' }); return false; }
          onSelect?.(selected);
          dialog.close('selected');
        }
      }
    ]
  });

  searchInput.addEventListener('input', debounce(() => { search = searchInput.value.trim(); cursor = ''; previousCursors = []; load(); }, 300));
  statusSelect.addEventListener('change', () => { status = statusSelect.value; cursor = ''; previousCursors = []; load(); });
  load();
  return modal;
}

export const MEDIA_PICKER_ACTION_LABEL = ACTION_LABEL;
