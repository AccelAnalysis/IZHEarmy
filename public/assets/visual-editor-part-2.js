'use strict';
const VISUAL_MEDIA_CATEGORIES = ['brand_mark','model_lifestyle','apparel_product','book','teaching','church','give_one','campaign','social','general'];
const visualHuman = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
function visualMediaPublishable(media) {
  if (!media || media.usageStatus !== 'approved') return false;
  if (['unverified','pending_release','restricted'].includes(media.rightsStatus)) return false;
  if (media.category === 'apparel_product' && ['review_required','concept_only','legacy_or_unverified','restricted'].includes(media.productAccuracyStatus)) return false;
  return true;
}
function visualMediaReason(media) {
  if (media.usageStatus !== 'approved') return `Usage: ${visualHuman(media.usageStatus || 'draft')}`;
  if (['unverified','pending_release','restricted'].includes(media.rightsStatus)) return `Rights: ${visualHuman(media.rightsStatus)}`;
  if (media.category === 'apparel_product' && ['review_required','concept_only','legacy_or_unverified','restricted'].includes(media.productAccuracyStatus)) return `Product: ${visualHuman(media.productAccuracyStatus)}`;
  return 'Approved';
}
function visualMediaCards() {
  return (data.media || []).map((item) => {
    const allowed = visualMediaPublishable(item);
    const search = [item.title,item.filename,item.alt,item.category,(item.tags || []).join(' ')].join(' ').toLowerCase();
    return `<button type="button" class="media-card ${allowed ? '' : 'media-disabled'}" data-media-url="${escapeHtml(item.url)}" data-media-category="${escapeHtml(item.category || 'general')}" data-media-search="${escapeHtml(search)}" ${allowed ? '' : 'disabled'}><img src="${escapeHtml(item.url)}" alt=""><span><strong>${escapeHtml(item.title || item.filename || item.id)}</strong><small style="display:block;color:${allowed ? '#86efac' : '#fcd34d'};margin-top:3px">${escapeHtml(visualMediaReason(item))}</small></span></button>`;
  }).join('');
}
function imageTools(key, field, current) {
  const categories = VISUAL_MEDIA_CATEGORIES.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(visualHuman(value))}</option>`).join('');
  return `<h3>Global Site Media Library</h3><p class="help">Only approved assets with acceptable rights and product verification can be applied to the public website.</p><div class="row"><input id="visualMediaSearch" class="field" placeholder="Search media"><select id="visualMediaCategory" class="field"><option value="">All categories</option>${categories}</select></div><div id="visualMediaGrid" class="media-grid">${visualMediaCards() || '<p class="help">No images are available.</p>'}</div><div class="upload"><label class="label" style="margin-top:0">UPLOAD TO GLOBAL LIBRARY</label><input id="visualMediaFile" type="file" accept="image/jpeg,image/png,image/webp" class="field"><input id="visualMediaTitle" class="field" placeholder="Media title"><input id="visualMediaAlt" class="field" placeholder="Accessible image description"><div class="row"><select id="visualMediaUploadCategory" class="field">${categories}</select><select id="visualMediaUploadUsage" class="field"><option value="draft">Draft</option><option value="approved">Approved</option></select></div><div class="row"><select id="visualMediaUploadRights" class="field"><option value="unverified">Rights unverified</option><option value="pending_release">Release pending</option><option value="release_on_file">Release on file</option><option value="owned_no_people">Owned / no people</option><option value="licensed">Licensed</option></select><select id="visualMediaUploadProduct" class="field"><option value="not_applicable">Product not applicable</option><option value="review_required">Product review required</option><option value="accurate">Product accurate</option><option value="concept_only">Concept only</option><option value="legacy_or_unverified">Legacy or unverified</option></select></div><button id="visualMediaUpload" type="button" class="button" style="width:100%;margin-top:10px">UPLOAD TO LIBRARY</button><p class="help">Use Approved only when the supporting license/release and any product match have been confirmed.</p></div>${current ? `<p class="help">Current image: ${escapeHtml(current)}</p>` : ''}`;
}
function filterVisualMedia() {
  const query = (document.getElementById('visualMediaSearch')?.value || '').trim().toLowerCase();
  const category = document.getElementById('visualMediaCategory')?.value || '';
  document.querySelectorAll('#visualMediaGrid .media-card').forEach((card) => {
    card.hidden = Boolean((category && card.dataset.mediaCategory !== category) || (query && !card.dataset.mediaSearch.includes(query)));
  });
}
async function visualDimensions(file) {
  if (!('createImageBitmap' in window)) return { width:0, height:0 };
  const bitmap = await createImageBitmap(file);
  const result = { width:bitmap.width, height:bitmap.height };
  bitmap.close();
  return result;
}
function bindImageTools(key, field) {
  document.querySelectorAll('[data-media-url]:not([disabled])').forEach((button) => button.addEventListener('click', () => updateField(key, field, button.dataset.mediaUrl)));
  document.getElementById('visualMediaSearch')?.addEventListener('input', filterVisualMedia);
  document.getElementById('visualMediaCategory')?.addEventListener('change', filterVisualMedia);
  document.getElementById('visualMediaUpload')?.addEventListener('click', async () => {
    const file = document.getElementById('visualMediaFile').files[0];
    const title = document.getElementById('visualMediaTitle').value.trim();
    const alt = document.getElementById('visualMediaAlt').value.trim();
    if (!file || !title || !alt) return setStatus('Choose an image and enter its title and accessible description.');
    const form = new FormData();
    const dimensions = await visualDimensions(file);
    form.append('file', file); form.append('title', title); form.append('alt', alt);
    form.append('category', document.getElementById('visualMediaUploadCategory').value);
    form.append('usageStatus', document.getElementById('visualMediaUploadUsage').value);
    form.append('rightsStatus', document.getElementById('visualMediaUploadRights').value);
    form.append('productAccuracyStatus', document.getElementById('visualMediaUploadProduct').value);
    form.append('width', dimensions.width); form.append('height', dimensions.height);
    try {
      setStatus('Uploading image…');
      const response = await fetch('/.netlify/functions/admin-upload-media', { method:'POST', headers:{ authorization:`Bearer ${token}` }, body:form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Image upload failed.');
      data.media.unshift(result.media);
      if (visualMediaPublishable(result.media)) updateField(key, field, result.media.url);
      renderFieldSelection(selected);
      setStatus(visualMediaPublishable(result.media) ? 'Image uploaded and applied to the visual draft.' : 'Image uploaded as a governed media record. Complete its approval in the Media workspace before using it.');
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
