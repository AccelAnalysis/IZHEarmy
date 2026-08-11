import { api } from '../api.js';
import { can } from '../permissions.js';
import { button, el, statusBadge } from '../ui/dom.js';
import { confirmDialog } from '../ui/dialog.js';
import { mediaPickerButton } from '../ui/media-picker.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, pageHeader, pageSection } from './page-utils.js';

function controlFor(definition, value) {
  if (definition.type === 'textarea') return el('textarea', { rows: 4, maxLength: definition.max || 5000, value: value ?? '' });
  if (definition.type === 'boolean') return el('input', { type: 'checkbox', checked: Boolean(value) });
  if (definition.type === 'number') return el('input', { type: 'number', min: definition.min, max: definition.max, value: value ?? '' });
  if (definition.type === 'enum') return el('select', {}, definition.options.map((option) => el('option', { value: option, textContent: option.replaceAll('_', ' '), selected: option === value })));
  if (definition.type === 'url') return el('input', { type: 'url', maxLength: definition.max || 1200, value: value ?? '' });
  if (definition.type === 'link') return el('input', { type: 'text', maxLength: definition.max || 500, value: value ?? '' });
  return el('input', { type: 'text', maxLength: definition.max || 1000, value: value ?? '' });
}

function valueFromControl(control, definition) {
  if (definition.type === 'boolean') return Boolean(control.checked);
  if (definition.type === 'number') return control.value === '' ? '' : Number(control.value);
  return control.value;
}

function sameFields(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

export async function renderVisualEditor({ session }) {
  let state = (await api('/.netlify/functions/admin-visual-editor')).data;
  const page = el('div', { className: 'page' });
  const editorRegion = el('div');
  const dirtyNotice = el('span', { className: 'field-help', textContent: 'No unsaved visual changes.' });
  const sectionSelect = el('select', { 'aria-label': 'Visual editor section' });
  const frameStatus = el('p', { className: 'field-help', textContent: 'Connecting secure same-origin preview…' });
  const frame = el('iframe', {
    title: 'Secure same-origin storefront preview',
    src: '/?visualFrame=1',
    style: { width: '100%', minHeight: '660px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' },
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
    referrerpolicy: 'no-referrer'
  });

  let selectedKey = '';
  let working = new Map();
  let dirtyKeys = new Set();

  function resetWorking() {
    working = new Map((state.records || []).map((record) => [record.key, structuredClone(record.fields || {})]));
    dirtyKeys = new Set();
    selectedKey = selectedKey && working.has(selectedKey) ? selectedKey : state.records?.[0]?.key || '';
    sectionSelect.replaceChildren(...(state.records || []).map((record) => el('option', {
      value: record.key,
      textContent: state.schemas?.[record.key]?.label || record.label || record.key,
      selected: record.key === selectedKey
    })));
    updateDirtyNotice();
  }

  function updateDirtyNotice() {
    const savedDraftCount = Array.isArray(state.draftChanges) ? state.draftChanges.length : 0;
    if (dirtyKeys.size) dirtyNotice.textContent = `${dirtyKeys.size} section${dirtyKeys.size === 1 ? '' : 's'} changed locally and not yet saved.`;
    else if (savedDraftCount) dirtyNotice.textContent = `${savedDraftCount} saved draft section${savedDraftCount === 1 ? '' : 's'} ready for preview or publication.`;
    else dirtyNotice.textContent = 'No unsaved visual changes.';
  }

  function currentRecord() {
    return (state.records || []).find((record) => record.key === selectedKey) || null;
  }

  function effectiveRecordsObject() {
    return Object.fromEntries((state.records || []).map((record) => [record.key, {
      ...record,
      fields: structuredClone(working.get(record.key) || record.fields || {})
    }]));
  }

  function sendPreview() {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'izhe-admin-preview-apply',
      version: 1,
      records: effectiveRecordsObject()
    }, window.location.origin);
  }

  function changesPayload() {
    const existingDraftKeys = new Set((state.draftChanges || []).map((change) => change.key));
    const keys = new Set([...existingDraftKeys, ...dirtyKeys]);
    return [...keys].map((key) => ({ key, fields: structuredClone(working.get(key) || {}) }));
  }

  function markField(record, fieldKey, definition, control) {
    const fields = working.get(record.key) || {};
    fields[fieldKey] = valueFromControl(control, definition);
    working.set(record.key, fields);
    if (sameFields(fields, record.fields)) dirtyKeys.delete(record.key);
    else dirtyKeys.add(record.key);
    updateDirtyNotice();
    sendPreview();
  }

  function renderEditor() {
    editorRegion.replaceChildren();
    const record = currentRecord();
    if (!record) {
      editorRegion.append(el('div', { className: 'empty-state' }, [el('h3', { textContent: 'No editable website section' })]));
      return;
    }
    const schema = state.schemas?.[record.key];
    if (!schema?.fields) {
      editorRegion.append(el('div', { className: 'empty-state' }, [el('h3', { textContent: 'This section has no visual schema' }), el('p', { textContent: record.key })]));
      return;
    }
    const fields = working.get(record.key) || record.fields || {};
    const form = el('form', { className: 'form-grid', on: { submit: (event) => event.preventDefault() } });
    for (const [fieldKey, definition] of Object.entries(schema.fields)) {
      const control = controlFor(definition, fields[fieldKey]);
      const wrapper = field(definition.label, control, {
        span: definition.type === 'textarea' ? 2 : 1,
        help: definition.type === 'url' && /image/i.test(fieldKey) ? 'Use a site-relative or approved HTTPS image URL, or choose an asset from the Media Library.' : ''
      });
      const eventName = definition.type === 'enum' || definition.type === 'boolean' ? 'change' : 'input';
      control.addEventListener(eventName, () => markField(record, fieldKey, definition, control));

      if (definition.type === 'url' && /image/i.test(fieldKey)) {
        const picker = mediaPickerButton({
          session,
          contextLabel: `${schema.label}: ${definition.label}`,
          onSelect: (media) => {
            if (!media) {
              control.value = '';
            } else {
              control.value = media.url || media.thumbnailUrl || '';
              const altKey = fieldKey === 'image' && schema.fields.imageAlt ? 'imageAlt' : '';
              if (altKey && media.altText) {
                const altControl = form.querySelector(`[data-field-key="${altKey}"]`);
                if (altControl) {
                  altControl.value = media.altText;
                  markField(record, altKey, schema.fields[altKey], altControl);
                }
              }
            }
            markField(record, fieldKey, definition, control);
          }
        });
        wrapper.append(el('div', { className: 'field-actions' }, picker));
      }
      control.dataset.fieldKey = fieldKey;
      form.append(wrapper);
    }
    editorRegion.append(
      el('div', { className: 'section-heading-row' }, [
        el('div', {}, [
          el('h3', { textContent: schema.label || record.label || record.key }),
          el('p', { className: 'field-help', textContent: `${record.key} · ${record.status || 'draft'}${record.visualDraft ? ' · saved visual draft' : ''}` })
        ]),
        statusBadge(record.visualDraft ? 'draft' : record.status || 'draft')
      ]),
      form
    );
  }

  async function refreshState() {
    state = (await api('/.netlify/functions/admin-visual-editor')).data;
    resetWorking();
    renderEditor();
    frame.src = `/?visualFrame=1&revision=${encodeURIComponent(state.draft?.revision || state.libraryRevision || '')}`;
  }

  async function saveDraft() {
    const changes = changesPayload();
    if (!changes.length) {
      toast('Make a visual change before saving a draft.', { tone: 'warning' });
      return;
    }
    const { data } = await api('/.netlify/functions/admin-visual-editor', {
      method: 'POST',
      body: { action: 'saveDraft', baseRevision: state.libraryRevision, changes }
    });
    state = data;
    resetWorking();
    renderEditor();
    frame.src = `/?visualFrame=1&revision=${encodeURIComponent(state.draft?.revision || state.libraryRevision || '')}`;
    toast('Visual draft was saved.', { tone: 'success' });
  }

  async function publish(reason) {
    const changes = changesPayload();
    if (!changes.length) {
      toast('There is no visual draft to publish.', { tone: 'warning' });
      return false;
    }
    const { data } = await api('/.netlify/functions/admin-visual-editor', {
      method: 'POST',
      body: { action: 'publish', baseRevision: state.libraryRevision, changes, reason }
    });
    state = data;
    resetWorking();
    renderEditor();
    frame.src = `/?visualFrame=1&revision=${encodeURIComponent(state.libraryRevision || '')}`;
    toast('Visual draft was published.', { tone: 'success' });
    return true;
  }

  async function discard(reason) {
    const { data } = await api('/.netlify/functions/admin-visual-editor', { method: 'POST', body: { action: 'discard', reason } });
    state = data;
    resetWorking();
    renderEditor();
    frame.src = `/?visualFrame=1&revision=${encodeURIComponent(state.libraryRevision || '')}`;
    toast('Visual draft was discarded.', { tone: 'success' });
    return true;
  }

  sectionSelect.addEventListener('change', () => { selectedKey = sectionSelect.value; renderEditor(); });
  frame.addEventListener('load', () => { frameStatus.textContent = 'Secure preview connected. Unsaved field changes update this frame without transmitting credentials.'; sendPreview(); });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'izhe-preview-ready' || event.data.version !== 1) return;
    frameStatus.textContent = 'Secure preview connected.';
    sendPreview();
  });

  resetWorking();
  const actionBar = el('div', { className: 'sticky-action-bar' }, [
    dirtyNotice,
    el('div', { className: 'page-actions' }, [
      can(session, 'content.website.write') ? button('Save Draft', { tone: 'secondary', onClick: () => saveDraft().catch((error) => errorToast(error, 'Visual draft could not be saved')) }) : null,
      button('Preview', { tone: 'secondary', iconName: 'eye', onClick: () => sendPreview() }),
      can(session, 'content.website.publish') ? button('Publish', { tone: 'primary', onClick: () => confirmDialog({ title: 'Publish Visual Draft', description: 'The current validated visual changes will become public using the existing revision rules.', confirmLabel: 'Publish', requireReason: true, onConfirm: ({ reason }) => publish(reason) }) }) : null,
      can(session, 'content.website.write') ? button('Discard Draft', { tone: 'danger-outline', onClick: () => confirmDialog({ title: 'Discard Visual Draft', description: 'The published storefront remains unchanged.', confirmLabel: 'Discard Draft', tone: 'danger', requireReason: true, requireCheckbox: true, onConfirm: ({ reason }) => discard(reason) }) }) : null,
      button('Reload', { tone: 'quiet', onClick: () => refreshState().catch((error) => errorToast(error, 'Visual Editor could not be reloaded')) })
    ])
  ]);

  page.append(
    pageHeader({ title: 'Visual Editor', description: 'Edit homepage visual fields with structured controls and the shared Media Library while reviewing a secure same-origin storefront preview.' }),
    pageSection({ title: 'Section', description: 'Choose the homepage section to edit. Field types and allowed values come from the server-owned content schema.', content: sectionSelect }),
    el('div', { className: 'split-workspace' }, [
      el('section', { className: 'editor-pane' }, editorRegion),
      el('section', { className: 'preview-pane' }, [el('h3', { textContent: 'Storefront preview' }), frameStatus, frame])
    ]),
    actionBar
  );
  renderEditor();
  return page;
}
