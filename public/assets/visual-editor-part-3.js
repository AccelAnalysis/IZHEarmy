'use strict';
function collectChanges() {
  return [...changedKeys].map((key) => ({ key, fields: clone(records.get(key).fields) }));
}

async function saveDraft() {
  if (!changedKeys.size) return;
  try {
    setStatus('Saving protected visual draft…');
    applyData(await api({ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ action:'saveDraft', baseRevision:data.libraryRevision, changes:collectChanges() }) }));
    post({ type:'ve:hydrate', records:workingPayload() });
    setStatus('Visual draft saved. The customer website has not changed.');
  } catch (error) { setStatus(error.message); }
}

async function publish() {
  if (!confirm('Publish these visual changes to the customer-facing website now?')) return;
  try {
    setStatus('Publishing website changes…');
    applyData(await api({ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ action:'publish', baseRevision:data.libraryRevision, changes:collectChanges() }) }));
    post({ type:'ve:hydrate', records:workingPayload() });
    setStatus('Website changes published successfully.');
  } catch (error) { setStatus(error.message); }
}

async function discardDraft() {
  if (!confirm('Discard the saved visual draft? Published website content will remain unchanged.')) return;
  try { applyData(await api({ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ action:'discard' }) })); post({ type:'ve:hydrate', records:workingPayload() }); setStatus('Saved visual draft discarded.'); } catch (error) { setStatus(error.message); }
}

function undo() {
  const snapshot = undoStack.pop(); if (!snapshot) return;
  records = snapshot.records; changedKeys = snapshot.changedKeys; selected = snapshot.selected; dirty = true;
  post({ type:'ve:hydrate', records:workingPayload() });
  if (selected?.kind === 'section') renderSectionSelection(selected.sectionId); else if (selected) renderFieldSelection(selected); else renderEmptyPanel();
  updateButtons(); setStatus('Last visual change undone.');
}

function resetUnsaved() {
  if (!confirm('Reset changes made since the last draft save or editor load?')) return;
  records = mapClone(baselineRecords); changedKeys = new Set(baselineChangedKeys); dirty = false; undoStack = [];
  post({ type:'ve:hydrate', records:workingPayload() }); renderEmptyPanel(); updateButtons(); setStatus('Unsaved changes reset.');
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const message = event.data || {};
  if (message.type === 've:ready') { frameReady = true; post({ type:'ve:hydrate', records:workingPayload() }); }
  if (message.type === 've:select') {
    selected = message.selection;
    if (selected.kind === 'section') renderSectionSelection(selected.sectionId); else renderFieldSelection(selected);
  }
  if (message.type === 've:fieldInput') {
    const id = `${message.key}:${message.field}`;
    updateField(message.key, message.field, message.value, { snapshot: activeInlineField !== id });
    activeInlineField = id;
  }
  if (message.type === 've:fieldCommit') activeInlineField = '';
});

document.querySelectorAll('[data-viewport]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-viewport]').forEach((item) => item.classList.toggle('active', item === button));
  frame.className = `canvas ${button.dataset.viewport === 'desktop' ? '' : button.dataset.viewport}`;
}));
document.getElementById('saveDraftButton').addEventListener('click', saveDraft);
document.getElementById('publishButton').addEventListener('click', publish);
document.getElementById('discardButton').addEventListener('click', discardDraft);
document.getElementById('undoButton').addEventListener('click', undo);
document.getElementById('resetButton').addEventListener('click', resetUnsaved);
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
load();
