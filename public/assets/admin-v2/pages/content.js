import { api } from '../api.js';
import { can } from '../permissions.js';
import { button, el, formatDate, icon, statusBadge } from '../ui/dom.js';
import { confirmDialog, createDialog } from '../ui/dialog.js';
import { mediaPickerButton } from '../ui/media-picker.js';
import { dataTable } from '../ui/table.js';
import { errorToast, toast } from '../ui/toast.js';
import { field, jsonDetails, openDrawer, pageHeader, pageSection } from './page-utils.js';

function objectRecords(root) {
  const rows = [];
  for (const [group, value] of Object.entries(root || {})) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') rows.push({ group, index, id: item.id || item.key || item.slug || `${group}-${index}`, title: item.title || item.name || item.heading || item.label || item.id || `${group} ${index + 1}`, status: item.status || item.publishStatus || '', record: item });
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push({ group, index: null, id: value.id || value.key || group, title: value.title || value.name || value.heading || group, status: value.status || value.publishStatus || '', record: value });
    }
  }
  return rows;
}

function jsonEditorDialog({ title, description, value, onSave, session, mediaContext }) {
  const editor = el('textarea', { rows: 24, className: 'code-block', spellcheck: false, 'aria-label': `${title} JSON editor` });
  editor.value = JSON.stringify(value, null, 2);
  const selectedMedia = el('p', { className: 'field-help', textContent: 'No Media Library asset selected during this editing session.' });
  const content = el('div', {}, [
    el('p', { className: 'field-help', textContent: 'The structured record is edited without executing embedded markup. Stored text is rendered as text throughout Admin v2.' }),
    mediaPickerButton({
      session,
      contextLabel: mediaContext,
      onSelect: (media) => { selectedMedia.textContent = media ? `Selected: ${media.title || media.filename || media.id} (${media.id})` : 'Media selection cleared.'; }
    }),
    selectedMedia,
    editor
  ]);
  return createDialog({
    title,
    description,
    wide: true,
    content,
    actions: [
      { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
      { label: 'Save Changes', tone: 'primary', onClick: async ({ dialog, footer }) => {
        let parsed;
        try { parsed = JSON.parse(editor.value); }
        catch { editor.setCustomValidity('Enter valid JSON.'); editor.reportValidity(); editor.setCustomValidity(''); return; }
        [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
        try {
          await onSave(parsed);
          dialog.close('saved');
        } catch (error) {
          errorToast(error);
          [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; });
        }
      } }
    ]
  });
}

export async function renderWebsiteContent({ session }) {
  let state = (await api('/.netlify/functions/admin-content-data')).data;
  const page = el('div', { className: 'page' });
  const region = el('div');

  async function saveLibrary(nextLibrary, action = 'saveDraft') {
    const { data } = await api('/.netlify/functions/admin-save-content', {
      method: 'POST',
      body: { library: nextLibrary, expectedEtag: state.etag, etag: state.etag, action }
    });
    state = { ...state, ...data, library: data.library || nextLibrary, etag: data.etag || state.etag };
    toast(action === 'publish' ? 'Website content was published.' : 'Website content draft was saved.', { tone: 'success' });
    render();
  }

  function editRow(row) {
    jsonEditorDialog({
      title: row.title,
      description: `${row.group} · ${row.id}`,
      value: row.record,
      session,
      mediaContext: `website content record ${row.title}`,
      onSave: async (updated) => {
        const library = structuredClone(state.library);
        if (row.index === null) library[row.group] = updated;
        else library[row.group][row.index] = updated;
        await saveLibrary(library, 'saveDraft');
      }
    });
  }

  function render() {
    region.replaceChildren();
    const rows = objectRecords(state.library);
    const table = dataTable({
      rows,
      caption: 'Website content records',
      columns: [
        { label: 'Content', value: 'title', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.title }), el('span', { className: 'table-secondary', textContent: `${item.group} · ${item.id}` })]) },
        { label: 'Type', value: 'group' },
        { label: 'Status', value: 'status', render: (value) => value ? statusBadge(value) : '—' }
      ],
      actions: (row) => [
        { label: 'Edit', visible: can(session, 'content.website.write'), onSelect: () => editRow(row) },
        { label: 'View Details', onSelect: () => openDrawer({ title: row.title, description: `${row.group} · ${row.id}`, content: jsonDetails(row.record) }) }
      ],
      emptyTitle: 'No structured website records',
      emptyMessage: 'The current content library does not expose an editable record collection.'
    });
    region.append(table.shell);
  }

  const actions = [];
  if (can(session, 'content.website.preview')) actions.push(button('Preview', { tone: 'secondary', iconName: 'eye', onClick: () => window.open('/?preview=1', '_blank', 'noopener,noreferrer') }));
  if (can(session, 'content.website.publish')) actions.push(button('Publish', { tone: 'primary', onClick: () => confirmDialog({ title: 'Publish Website Content', description: 'The current draft will become visible on the public storefront while public commerce rules remain unchanged.', confirmLabel: 'Publish', requireReason: true, onConfirm: ({ reason }) => saveLibrary({ ...state.library, publicationReason: reason }, 'publish') }) }));
  page.append(
    pageHeader({ title: 'Website Content', description: 'Structured website records, drafts, previews, scheduling metadata, and publication controls in one full-width content workspace.', actions }),
    pageSection({ title: 'Structured content', description: `Current revision: ${state.library?.revision ?? state.etag ?? 'unversioned'}. Revision conflicts remain server-enforced.`, content: region })
  );
  render();
  return page;
}

export async function renderVisualEditor({ session }) {
  let state = (await api('/.netlify/functions/admin-visual-editor')).data;
  const page = el('div', { className: 'page' });
  const editor = el('textarea', { rows: 28, className: 'code-block', spellcheck: false, 'aria-label': 'Visual editor draft data' });
  editor.value = JSON.stringify(state.draft || state, null, 2);
  const frame = el('iframe', {
    title: 'Secure same-origin storefront preview',
    src: '/?preview=1',
    style: { width: '100%', minHeight: '660px', border: '1px solid var(--border)', borderRadius: '10px', background: 'white' },
    sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
    referrerpolicy: 'no-referrer'
  });
  const frameStatus = el('p', { className: 'field-help', textContent: 'The preview uses the HttpOnly administrator session; credentials are not placed in the URL or postMessage payload.' });

  function parsedDraft() {
    try { return JSON.parse(editor.value); }
    catch { editor.setCustomValidity('Enter valid JSON.'); editor.reportValidity(); editor.setCustomValidity(''); return null; }
  }
  async function action(actionName, extra = {}) {
    const draft = parsedDraft();
    if (!draft && actionName !== 'discard') return;
    const { data } = await api('/.netlify/functions/admin-visual-editor', { method: 'POST', body: { action: actionName, draft, expectedRevision: state.draft?.revision || state.revision || '', ...extra } });
    state = data;
    editor.value = JSON.stringify(state.draft || state, null, 2);
    toast(actionName === 'publish' ? 'Visual draft was published.' : actionName === 'discard' ? 'Visual draft was discarded.' : 'Visual draft was saved.', { tone: 'success' });
    frame.contentWindow?.postMessage({ type: 'izhe-admin-preview-refresh', version: 1 }, window.location.origin);
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'izhe-preview-ready' || event.data.version !== 1) return;
    frameStatus.textContent = 'Secure preview connected.';
  }, { once: true });

  const actionBar = el('div', { className: 'sticky-action-bar' }, [
    el('span', { className: 'field-help', textContent: `Draft revision ${state.draft?.revision || state.revision || 'new'}` }),
    el('div', { className: 'page-actions' }, [
      can(session, 'content.website.write') ? button('Save Draft', { tone: 'secondary', onClick: () => action('saveDraft') }) : null,
      button('Preview', { tone: 'secondary', iconName: 'eye', onClick: () => { frame.contentWindow?.location.reload(); } }),
      can(session, 'content.website.publish') ? button('Publish', { tone: 'primary', onClick: () => confirmDialog({ title: 'Publish Visual Draft', description: 'This publishes the current visual draft using the existing revision and publication rules.', confirmLabel: 'Publish', requireReason: true, onConfirm: ({ reason }) => action('publish', { reason }) }) }) : null,
      can(session, 'content.website.write') ? button('Discard Draft', { tone: 'danger-outline', onClick: () => confirmDialog({ title: 'Discard Visual Draft', description: 'The published storefront remains unchanged.', confirmLabel: 'Discard Draft', tone: 'danger', requireReason: true, requireCheckbox: true, onConfirm: ({ reason }) => action('discard', { reason }) }) }) : null
    ])
  ]);

  page.append(
    pageHeader({ title: 'Visual Editor', description: 'Edit draft visual state and review it in a narrowly scoped same-origin storefront frame.' }),
    el('div', { className: 'split-workspace' }, [
      el('section', {}, [el('h3', { textContent: 'Draft visual state' }), mediaPickerButton({ session, contextLabel: 'the visual editor', onSelect: (media) => toast(`${media?.title || 'Media'} is ready to reference by ID ${media?.id || ''}.`, { tone: 'information' }) }), editor]),
      el('section', {}, [el('h3', { textContent: 'Storefront preview' }), frameStatus, frame])
    ]),
    actionBar
  );
  return page;
}

async function uploadTeachingFile(refresh) {
  const resourceId = el('input', { type: 'text', required: true, maxLength: 100 });
  const fileInput = el('input', { type: 'file', required: true, accept: '.pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.mp4' });
  const form = el('form', { className: 'form-grid' }, [field('Resource ID', resourceId, { help: 'Files are bound to a teaching resource and remain unpublished until the resource access rules allow them.' }), field('File', fileInput, { help: 'Documents may require a configured malware scanner. SVG is not accepted.' })]);
  createDialog({ title: 'Upload Teaching Resource', description: 'The file is quarantined, signature-checked, and released only after validation.', content: form, actions: [
    { label: 'Cancel', tone: 'secondary', onClick: ({ dialog }) => dialog.close('cancel') },
    { label: 'Upload New', tone: 'primary', icon: 'upload', onClick: async ({ dialog, footer }) => {
      if (!form.reportValidity()) return;
      [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = true; });
      try {
        const data = new FormData(); data.set('resourceId', resourceId.value.trim()); data.set('file', fileInput.files[0]);
        await api('/.netlify/functions/admin-upload-teaching-file', { method: 'POST', body: data });
        toast('Teaching file passed validation and was stored as unpublished.', { tone: 'success' }); dialog.close('uploaded'); refresh();
      } catch (error) { errorToast(error, 'Teaching file could not be uploaded'); [...footer.querySelectorAll('button')].forEach((control) => { control.disabled = false; }); }
    } }
  ] });
}

export async function renderTeaching({ session }) {
  let state = (await api('/.netlify/functions/admin-teaching-data')).data;
  const page = el('div', { className: 'page' });
  const region = el('div');
  async function refresh() { state = (await api('/.netlify/functions/admin-teaching-data')).data; render(); }
  async function saveLibrary(library, action = 'saveDraft') {
    const { data } = await api('/.netlify/functions/admin-save-teaching', { method: 'POST', body: { library, expectedEtag: state.etag, etag: state.etag, action } });
    state = { ...state, ...data, library: data.library || library, etag: data.etag || state.etag };
    toast(action === 'publish' ? 'Teaching content was published.' : 'Teaching draft was saved.', { tone: 'success' }); render();
  }
  function render() {
    const records = objectRecords(state.library);
    const table = dataTable({ rows: records, caption: 'Teaching library records', columns: [
      { label: 'Teaching record', value: 'title', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.title }), el('span', { className: 'table-secondary', textContent: `${item.group} · ${item.id}` })]) },
      { label: 'Type', value: 'group' }, { label: 'Status', value: 'status', render: (value) => value ? statusBadge(value) : '—' }
    ], actions: (row) => [
      { label: 'Edit', visible: can(session, 'content.teaching.write'), onSelect: () => jsonEditorDialog({ title: row.title, description: `${row.group} · ${row.id}`, value: row.record, session, mediaContext: `teaching record ${row.title}`, onSave: async (updated) => { const library = structuredClone(state.library); if (row.index === null) library[row.group] = updated; else library[row.group][row.index] = updated; await saveLibrary(library); } }) },
      { label: 'View Details', onSelect: () => openDrawer({ title: row.title, description: `${row.group} · ${row.id}`, content: jsonDetails(row.record) }) }
    ] });
    const files = dataTable({ rows: state.files || [], caption: 'Teaching files', columns: [
      { label: 'File', value: 'filename', render: (_value, item) => el('span', {}, [el('span', { className: 'table-primary', textContent: item.filename || item.id }), el('span', { className: 'table-secondary', textContent: `${item.contentType || 'unknown'} · ${item.resourceId || 'unbound'}` })]) },
      { label: 'Validation', value: 'validationStatus', render: (value) => statusBadge(value || 'legacy') },
      { label: 'Access', value: 'accessStatus', render: (value) => statusBadge(value || 'unpublished') },
      { label: 'Uploaded', value: 'createdAt', render: (value) => formatDate(value, { dateOnly: true }) }
    ], actions: (item) => [{ label: 'View Details', onSelect: () => openDrawer({ title: item.filename || item.id, content: jsonDetails(item) }) }, { label: 'Open file', onSelect: () => window.open(item.url, '_blank', 'noopener,noreferrer') }] });
    region.replaceChildren(pageSection({ title: 'Books, chapters, and resources', description: 'Structured teaching content with draft and publication authority separated.', content: table.shell }), pageSection({ title: 'Teaching files', description: 'Validated files remain subject to resource-level public or administrator-only access rules.', content: files.shell }));
  }
  const actions = [];
  if (can(session, 'content.teaching.write')) actions.push(button('Upload New', { tone: 'secondary', iconName: 'upload', onClick: () => uploadTeachingFile(refresh) }));
  if (can(session, 'content.teaching.publish')) actions.push(button('Publish', { tone: 'primary', onClick: () => confirmDialog({ title: 'Publish Teaching Library', description: 'Only records that satisfy the existing teaching access and publication rules will become public.', confirmLabel: 'Publish', requireReason: true, onConfirm: ({ reason }) => saveLibrary({ ...state.library, publicationReason: reason }, 'publish') }) }));
  page.append(pageHeader({ title: 'Teaching Library', description: 'Books, chapters, resources, media associations, file validation, access levels, and publication controls.', actions }), region);
  render();
  return page;
}
