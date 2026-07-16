'use strict';
(() => {
  const headerActions = document.querySelector('header .flex.gap-3');
  if (headerActions && !document.getElementById('openVisualEditor')) {
    const button = document.createElement('a');
    button.id = 'openVisualEditor'; button.href = '/visual-editor.html';
    button.className = 'bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-extrabold';
    button.textContent = 'EDIT WEBSITE VISUALLY'; headerActions.prepend(button);
  }
  const contentPreview = document.getElementById('previewWebsiteContent');
  if (contentPreview && !document.getElementById('visualEditFromContent')) {
    const button = document.createElement('a'); button.id = 'visualEditFromContent'; button.href = '/visual-editor.html';
    button.className = 'bg-amber-400 text-slate-950 px-3 py-2 rounded-lg font-bold'; button.textContent = 'VISUAL EDIT';
    contentPreview.insertAdjacentElement('beforebegin', button);
  }

  function layoutFieldMarkup(fieldKey, definition, value) {
    const label = `<span class="label">${escapeHtml(definition.label.toUpperCase())}</span>`;
    if (definition.type === 'boolean') return `<label class="flex items-center gap-3 border border-white/10 rounded-xl p-4"><input data-content-field="${fieldKey}" type="checkbox" class="w-5 h-5 accent-amber-400" ${value ? 'checked' : ''}><span>${escapeHtml(definition.label)}</span></label>`;
    if (definition.type === 'enum') return `<label>${label}<select data-content-field="${fieldKey}" class="field">${definition.options.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${escapeHtml(humanStatus(option))}</option>`).join('')}</select></label>`;
    if (definition.type === 'number') return `<label>${label}<input data-content-field="${fieldKey}" type="number" min="${definition.min ?? ''}" max="${definition.max ?? ''}" class="field" value="${escapeHtml(value)}"></label>`;
    return `<label>${label}<input data-content-field="${fieldKey}" class="field" value="${escapeHtml(value ?? '')}"></label>`;
  }

  if (typeof editContent === 'function') {
    const baseEditContentForVisual = editContent;
    editContent = function editContentWithLayoutControls(key) {
      baseEditContentForVisual(key);
      if (key !== 'site-layout') return;
      const record = priority4Data.content.library.records.find((item) => item.key === key);
      const schema = priority4Data.content.schemas[key];
      if (!record || !schema) return;
      $('#websiteContentFields').innerHTML = Object.entries(schema.fields).map(([fieldKey, definition]) => layoutFieldMarkup(fieldKey, definition, record.fields[fieldKey])).join('');
      $('#websiteContentTitle').textContent = 'Homepage layout presets';
      const message = $('#websiteContentMessage');
      message.textContent = 'These safe layout settings are easier to adjust in the Visual Editor.';
      message.className = 'text-sm text-amber-300';
    };
  }

  $('#websiteContentForm')?.addEventListener('submit', async (event) => {
    if ($('#websiteContentKey').value !== 'site-layout') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const fields = Object.fromEntries($$('[data-content-field]').map((input) => [input.dataset.contentField, input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value]));
    try {
      const result = await request('/.netlify/functions/admin-save-content', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ expectedRevision:priority4Data.content.library.revision, record:{ key:'site-layout', status:$('#websiteContentStatus').value, publishAt:toIso($('#websiteContentPublishAt').value), unpublishAt:toIso($('#websiteContentUnpublishAt').value), fields } }) });
      priority4Data.content.library = result.library; activeContentKey = 'site-layout'; editContent('site-layout'); setMessage($('#websiteContentMessage'),'Homepage layout presets saved.',true);
    } catch (error) { setMessage($('#websiteContentMessage'),error.message); }
  }, true);
})();
