'use strict';
function imageTools(key, field, current) {
  const cards = (data.media || []).slice(0, 24).map((item) => `<button type="button" class="media-card" data-media-url="${escapeHtml(item.url)}"><img src="${escapeHtml(item.url)}" alt=""><span>${escapeHtml(item.filename || item.alt || item.id)}</span></button>`).join('');
  return `<h3>Media Library</h3><div class="media-grid">${cards || '<p class="help">No images uploaded yet.</p>'}</div><div class="upload"><label class="label" style="margin-top:0">UPLOAD A NEW IMAGE</label><input id="visualMediaFile" type="file" accept="image/jpeg,image/png,image/webp" class="field"><input id="visualMediaAlt" class="field" placeholder="Accessible image description"><button id="visualMediaUpload" type="button" class="button" style="width:100%;margin-top:10px">UPLOAD AND USE</button></div>${current ? `<p class="help">Current image: ${escapeHtml(current)}</p>` : ''}`;
}

function bindImageTools(key, field) {
  document.querySelectorAll('[data-media-url]').forEach((button) => button.addEventListener('click', () => updateField(key, field, button.dataset.mediaUrl)));
  document.getElementById('visualMediaUpload')?.addEventListener('click', async () => {
    const file = document.getElementById('visualMediaFile').files[0];
    const alt = document.getElementById('visualMediaAlt').value.trim();
    if (!file || !alt) return setStatus('Choose an image and enter its description.');
    const form = new FormData(); form.append('file', file); form.append('alt', alt);
    try {
      setStatus('Uploading image…');
      const response = await fetch('/.netlify/functions/admin-upload-media', { method:'POST', headers:{ authorization:`Bearer ${token}` }, body:form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Image upload failed.');
      data.media.unshift(result.media);
      updateField(key, field, result.media.url);
      renderFieldSelection(selected);
      setStatus('Image uploaded and applied to the draft.');
    } catch (error) { setStatus(error.message); }
  });
}

function layoutRecord() { return records.get('site-layout'); }
function settingControl(field, label) {
  const schema = data.schemas['site-layout'].fields[field];
  const value = layoutRecord().fields[field];
  if (schema.type === 'boolean') return `<label class="toggle"><input data-layout-field="${field}" type="checkbox" ${value ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`;
  return `<label class="label">${escapeHtml(label.toUpperCase())}</label>${inputMarkup(schema, value, `layout-${field}`)}`;
}

function renderSectionSelection(sectionId) {
  const config = SECTION_SETTINGS[sectionId];
  if (!config) return;
  const controls = [settingControl(config.visible, 'Show this section')];
  if (config.order) controls.push(`<div class="row"><button id="moveSectionUp" class="button" type="button">MOVE UP</button><button id="moveSectionDown" class="button" type="button">MOVE DOWN</button></div>`);
  if (config.alignment) controls.push(settingControl(config.alignment, 'Content alignment'));
  if (config.spacing) controls.push(settingControl(config.spacing, 'Section spacing'));
  if (config.height) controls.push(settingControl(config.height, 'Section height'));
  if (config.imagePosition) controls.push(settingControl(config.imagePosition, 'Image position'));
  if (config.overlay) controls.push(settingControl(config.overlay, 'Image overlay'));
  if (config.focal) controls.push(settingControl(config.focal, 'Image focal point'));
  panel.innerHTML = `<h2>${escapeHtml(config.label)} section</h2><p class="help">These are governed layout controls. The site remains responsive and structural components cannot be freely dragged into unsafe positions.</p>${config.locked ? '<div class="notice">Product cards and collection content are managed from Catalog. You can still move, hide, or change the spacing of this section.</div>' : ''}${controls.join('')}`;
  panel.querySelectorAll('[data-layout-field]').forEach((input) => input.addEventListener('change', () => updateField('site-layout', input.dataset.layoutField, input.checked)));
  Object.values(config).filter((field) => typeof field === 'string' && data.schemas['site-layout'].fields[field]?.type !== 'boolean').forEach((field) => {
    const input = document.getElementById(`layout-${field}`);
    if (!input) return;
    input.addEventListener('change', () => updateField('site-layout', field, data.schemas['site-layout'].fields[field].type === 'number' ? Number(input.value) : input.value));
  });
  document.getElementById('moveSectionUp')?.addEventListener('click', () => moveSection(sectionId, -1));
  document.getElementById('moveSectionDown')?.addEventListener('click', () => moveSection(sectionId, 1));
}

function moveSection(sectionId, direction) {
  const config = SECTION_SETTINGS[sectionId];
  if (!config?.order) return;
  const orderFields = Object.values(SECTION_SETTINGS).map((item) => item.order).filter(Boolean);
  const ordered = orderFields.map((field) => ({ field, value: Number(layoutRecord().fields[field]) })).sort((a,b) => a.value - b.value);
  const index = ordered.findIndex((item) => item.field === config.order);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
  pushSnapshot();
  const first = ordered[index]; const second = ordered[swapIndex];
  layoutRecord().fields[first.field] = second.value;
  layoutRecord().fields[second.field] = first.value;
  markChanged('site-layout');
  post({ type:'ve:updateField', key:'site-layout', field:first.field, value:second.value });
  post({ type:'ve:updateField', key:'site-layout', field:second.field, value:first.value });
  renderSectionSelection(sectionId);
}
