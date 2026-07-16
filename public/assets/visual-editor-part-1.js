'use strict';
const token = localStorage.getItem('izhe-admin-token') || '';
const frame = document.getElementById('siteFrame');
const panel = document.getElementById('selectionPanel');
const statusBox = document.getElementById('editorStatus');
const accessError = document.getElementById('accessError');
const clone = (value) => structuredClone(value);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
let data = null;
let records = new Map();
let baselineRecords = new Map();
let changedKeys = new Set();
let baselineChangedKeys = new Set();
let selected = null;
let dirty = false;
let undoStack = [];
let frameReady = false;
let activeInlineField = '';

const SECTION_SETTINGS = {
  top: { label: 'Hero', visible: 'heroVisible', alignment: 'heroAlignment', height: 'heroHeight', overlay: 'heroOverlay', focal: 'heroFocalPoint' },
  story: { label: 'Story', visible: 'storyVisible', order: 'storyOrder', alignment: 'storyAlignment', imagePosition: 'storyImagePosition', spacing: 'storySpacing' },
  book: { label: 'Book', visible: 'bookVisible', order: 'bookOrder', alignment: 'bookAlignment', overlay: 'bookOverlay', spacing: 'bookSpacing' },
  collection: { label: 'Collection', visible: 'collectionVisible', order: 'collectionOrder', spacing: 'collectionSpacing', locked: true },
  'give-one': { label: 'Give One', visible: 'giveOneVisible', order: 'giveOneOrder', alignment: 'giveOneAlignment', imagePosition: 'giveOneImagePosition', spacing: 'giveOneSpacing' },
  church: { label: 'Churches & Ministries', visible: 'churchVisible', order: 'churchOrder', alignment: 'churchAlignment', overlay: 'churchOverlay', spacing: 'churchSpacing' }
};

async function api(options = {}) {
  const response = await fetch('/.netlify/functions/admin-visual-editor', {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'The visual editor request failed.');
  return body;
}

function recordMap(items) { return new Map((items || []).map((item) => [item.key, clone(item)])); }
function mapClone(map) { return new Map([...map].map(([key, value]) => [key, clone(value)])); }
function workingPayload() { return Object.fromEntries([...records].map(([key, record]) => [key, record])); }
function post(message) { if (frameReady) frame.contentWindow.postMessage(message, location.origin); }
function setStatus(message) { statusBox.textContent = message; }

function applyData(next) {
  data = next;
  records = recordMap(next.records);
  baselineRecords = mapClone(records);
  changedKeys = new Set((next.draftChanges || []).map((change) => change.key));
  baselineChangedKeys = new Set(changedKeys);
  dirty = false;
  undoStack = [];
  selected = null;
  renderEmptyPanel();
  updateButtons();
  if (frameReady) post({ type: 've:hydrate', records: workingPayload() });
  setStatus(next.draft?.stale ? 'Saved draft is stale. Reload the latest content before editing.' : next.draft ? `Draft revision ${next.draft.revision} saved ${new Date(next.draft.updatedAt).toLocaleString()}` : `Live content revision ${next.libraryRevision}`);
}

async function load() {
  if (!token) {
    accessError.classList.remove('hidden');
    accessError.innerHTML = 'Administrator access is required. Open <a href="/admin.html" style="text-decoration:underline">the admin portal</a>, sign in, then reopen the visual editor.';
    return;
  }
  try {
    setStatus('Loading visual editor…');
    applyData(await api());
    frame.src = `/?visualFrame=1&editor=${Date.now()}`;
  } catch (error) {
    accessError.classList.remove('hidden');
    accessError.textContent = error.message;
    setStatus('Unable to open editor');
  }
}

function updateButtons() {
  document.getElementById('saveDraftButton').disabled = !dirty;
  document.getElementById('publishButton').disabled = !dirty && !(data?.draft && !data.draft.stale);
  document.getElementById('discardButton').disabled = !data?.draft;
  document.getElementById('undoButton').disabled = !undoStack.length;
  document.getElementById('resetButton').disabled = !dirty;
}

function pushSnapshot() {
  undoStack.push({ records: mapClone(records), changedKeys: new Set(changedKeys), selected: clone(selected) });
  if (undoStack.length > 50) undoStack.shift();
  updateButtons();
}

function markChanged(key) {
  changedKeys.add(key);
  dirty = true;
  updateButtons();
  setStatus(`${changedKeys.size} section${changedKeys.size === 1 ? '' : 's'} changed — not yet saved`);
}

function updateField(key, field, value, { snapshot = true } = {}) {
  const record = records.get(key);
  if (!record) return;
  if (snapshot) pushSnapshot();
  record.fields[field] = value;
  markChanged(key);
  post({ type: 've:updateField', key, field, value });
}

function renderEmptyPanel() {
  panel.innerHTML = '<div class="empty"><strong>Select text, an image, a button, or a section in the page.</strong><p class="help">Gold outlines are editable. Gray labels identify components governed elsewhere.</p></div>';
}

function inputMarkup(definition, value, id = 'selectedValue') {
  if (definition?.type === 'textarea') return `<textarea id="${id}" class="field" rows="7">${escapeHtml(value)}</textarea>`;
  if (definition?.type === 'enum') return `<select id="${id}" class="field">${definition.options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option.replaceAll('_',' '))}</option>`).join('')}</select>`;
  if (definition?.type === 'number') return `<input id="${id}" class="field" type="number" min="${definition.min ?? ''}" max="${definition.max ?? ''}" value="${escapeHtml(value)}">`;
  return `<input id="${id}" class="field" type="${definition?.type === 'url' ? 'url' : 'text'}" value="${escapeHtml(value)}">`;
}

function bindValueInput(key, field, definition) {
  const input = document.getElementById('selectedValue');
  if (!input) return;
  let snapshotted = false;
  input.addEventListener('focus', () => { snapshotted = false; });
  input.addEventListener('input', () => {
    const value = definition?.type === 'number' ? Number(input.value) : input.value;
    updateField(key, field, value, { snapshot: !snapshotted });
    snapshotted = true;
  });
}

function renderFieldSelection(selection) {
  const record = records.get(selection.key);
  const definition = data.schemas?.[selection.key]?.fields?.[selection.field] || { label: selection.label, type: selection.kind === 'image' || selection.kind === 'background' ? 'url' : 'text' };
  const value = record?.fields?.[selection.field] ?? '';
  const isImage = ['image','background'].includes(selection.kind) || definition.type === 'url' && /image|background|cover|thumbnail/i.test(selection.field);
  panel.innerHTML = `<h2>${escapeHtml(selection.label || definition.label)}</h2><p class="help">Editing ${escapeHtml(data.schemas?.[selection.key]?.label || selection.key)}. Changes appear immediately in this protected preview.</p><label class="label">${escapeHtml(definition.label.toUpperCase())}</label>${inputMarkup(definition, value)}${selection.targetField ? `<label class="label">BUTTON DESTINATION</label>${inputMarkup(data.schemas[selection.key].fields[selection.targetField], record.fields[selection.targetField] || '', 'selectedTarget')}` : ''}${isImage ? imageTools(selection.key, selection.field, value) : ''}`;
  bindValueInput(selection.key, selection.field, definition);
  if (selection.targetField) {
    const target = document.getElementById('selectedTarget');
    let targetSnapshot = false;
    target.addEventListener('focus', () => { targetSnapshot = false; });
    target.addEventListener('input', () => { updateField(selection.key, selection.targetField, target.value, { snapshot: !targetSnapshot }); targetSnapshot = true; });
  }
  if (isImage) bindImageTools(selection.key, selection.field);
}
