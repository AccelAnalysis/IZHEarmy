'use strict';
(() => {
  const categories = ['brand_mark','model_lifestyle','apparel_product','book','teaching','church','give_one','campaign','social','general'];
  const usageStatuses = ['draft','approved','restricted','archived'];
  const rightsStatuses = ['unverified','pending_release','release_on_file','owned_no_people','licensed','restricted'];
  const productStatuses = ['not_applicable','review_required','accurate','concept_only','legacy_or_unverified','retired_product','restricted'];
  const focalPoints = ['center','top','bottom','left','right','top_left','top_right','bottom_left','bottom_right'];
  const human = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const optionMarkup = (values, selected = '') => values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(human(value))}</option>`).join('');
  const mediaById = (id) => catalogData?.media?.find((item) => item.id === id);

  function publishable(media) {
    if (!media || media.usageStatus !== 'approved') return false;
    if (['unverified','pending_release','restricted'].includes(media.rightsStatus)) return false;
    if (media.category === 'apparel_product' && ['review_required','concept_only','legacy_or_unverified','restricted'].includes(media.productAccuracyStatus)) return false;
    return true;
  }

  function approvalReason(media) {
    if (media.usageStatus !== 'approved') return `Usage status is ${human(media.usageStatus || 'draft')}.`;
    if (['unverified','pending_release','restricted'].includes(media.rightsStatus)) return `Rights status is ${human(media.rightsStatus)}.`;
    if (media.category === 'apparel_product' && ['review_required','concept_only','legacy_or_unverified','restricted'].includes(media.productAccuracyStatus)) return `Product accuracy is ${human(media.productAccuracyStatus)}.`;
    return '';
  }

  async function imageDimensions(file) {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      const result = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = url;
      });
      return { width: image.naturalWidth, height: image.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }

  function mediaFormMarkup() {
    return `<div><h2 class="text-2xl font-bold">Add to Site Media Library</h2><p class="text-sm text-slate-400 mt-2">Upload once, document its rights and intended use, then reuse it across products, structured content, teaching, campaigns, and the visual editor.</p></div>
      <label><span class="label">IMAGE FILE</span><input id="mediaFile" name="file" type="file" accept="image/jpeg,image/png,image/webp" required class="field"></label>
      <label><span class="label">MEDIA TITLE</span><input id="mediaTitle" class="field" required placeholder="Woman wearing white IZHE logo tee"></label>
      <label><span class="label">ACCESSIBLE ALT TEXT</span><input id="mediaAlt" name="alt" class="field" required placeholder="Describe what a visitor should understand from the image"></label>
      <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">CATEGORY</span><select id="mediaCategory" class="field">${optionMarkup(categories,'general')}</select></label><label><span class="label">USAGE STATUS</span><select id="mediaUsageStatus" class="field">${optionMarkup(usageStatuses,'draft')}</select></label></div>
      <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">RIGHTS / RELEASE STATUS</span><select id="mediaRightsStatus" class="field">${optionMarkup(rightsStatuses,'unverified')}</select></label><label><span class="label">PRODUCT ACCURACY</span><select id="mediaProductAccuracy" class="field">${optionMarkup(productStatuses,'review_required')}</select></label></div>
      <label><span class="label">TAGS</span><input id="mediaTags" class="field" placeholder="collection-1, healer, blue-logo"></label>
      <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">CREDIT / SOURCE</span><input id="mediaCredit" class="field"></label><label><span class="label">FOCAL POINT</span><select id="mediaFocalPoint" class="field">${optionMarkup(focalPoints,'center')}</select></label></div>
      <label><span class="label">REVIEW NOTES</span><textarea id="mediaNotes" class="field" rows="3" placeholder="Quality, release, crop, or product-verification notes"></textarea></label>
      <label><span class="label">RECOMMENDED USE</span><textarea id="mediaRecommendedUse" class="field" rows="2" placeholder="Where this image is appropriate"></textarea></label>
      <div class="border border-amber-400/30 bg-amber-400/5 rounded-xl p-4 text-xs text-amber-100">Public website pickers only enable assets marked <strong>Approved</strong> with acceptable rights. Apparel product images also require an accurate product match.</div>
      <button class="w-full bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl">UPLOAD IMAGE</button><p id="mediaStatus" class="text-sm"></p>`;
  }

  function installMediaWorkspace() {
    const original = $('#mediaUploadForm');
    if (!original || original.dataset.globalMedia === '1') return;
    const form = original.cloneNode(false);
    form.id = 'mediaUploadForm';
    form.className = original.className;
    form.dataset.globalMedia = '1';
    form.innerHTML = mediaFormMarkup();
    original.replaceWith(form);
    form.addEventListener('submit', uploadMedia);

    const grid = $('#mediaGrid');
    const card = grid?.closest('.card');
    const heading = card?.querySelector('h2');
    const intro = heading?.parentElement?.querySelector('p');
    if (heading) heading.textContent = 'Global Site Media Library';
    if (intro) intro.textContent = 'Search, approve, document, and reuse media across the complete IZHE website and administration system.';
    if (grid && !$('#globalMediaFilters')) {
      grid.insertAdjacentHTML('beforebegin', `<div id="globalMediaFilters" class="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-5"><input id="mediaSearch" class="field" placeholder="Search media"><select id="mediaCategoryFilter" class="field"><option value="">All categories</option>${optionMarkup(categories)}</select><select id="mediaUsageFilter" class="field"><option value="">All usage statuses</option>${optionMarkup(usageStatuses)}</select><select id="mediaRightsFilter" class="field"><option value="">All rights statuses</option>${optionMarkup(rightsStatuses)}</select><select id="mediaOrientationFilter" class="field"><option value="">All orientations</option>${optionMarkup(['portrait','landscape','square','unknown'])}</select></div><p id="mediaFilterSummary" class="text-xs text-slate-400 mb-4"></p>`);
      ['mediaSearch','mediaCategoryFilter','mediaUsageFilter','mediaRightsFilter','mediaOrientationFilter'].forEach((id) => $(`#${id}`).addEventListener(id === 'mediaSearch' ? 'input' : 'change', renderMedia));
    }
    const heroInput = $('#collectionHeroImage');
    if (heroInput) attachPickerButton(heroInput, 'Choose collection hero image');
  }

  async function uploadMedia(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const button = formElement.querySelector('button[type="submit"],button:not([type])');
    const status = $('#mediaStatus');
    const file = $('#mediaFile').files[0];
    if (!file) return setMessage(status, 'Choose an image to upload.');
    button.disabled = true;
    button.textContent = 'UPLOADING…';
    try {
      const dimensions = await imageDimensions(file);
      const form = new FormData();
      form.append('file', file);
      form.append('title', $('#mediaTitle').value);
      form.append('alt', $('#mediaAlt').value);
      form.append('category', $('#mediaCategory').value);
      form.append('usageStatus', $('#mediaUsageStatus').value);
      form.append('rightsStatus', $('#mediaRightsStatus').value);
      form.append('productAccuracyStatus', $('#mediaProductAccuracy').value);
      form.append('tags', $('#mediaTags').value);
      form.append('credit', $('#mediaCredit').value);
      form.append('notes', $('#mediaNotes').value);
      form.append('recommendedUse', $('#mediaRecommendedUse').value);
      form.append('focalPoint', $('#mediaFocalPoint').value);
      form.append('width', dimensions.width);
      form.append('height', dimensions.height);
      const result = await request('/.netlify/functions/admin-upload-media', { method:'POST', body:form });
      catalogData.media.unshift(result.media);
      renderMedia();
      formElement.reset();
      setMessage(status, 'Image uploaded to the global media library.', true);
    } catch (error) { setMessage(status, error.message); }
    finally { button.disabled = false; button.textContent = 'UPLOAD IMAGE'; }
  }

  function filteredMedia() {
    const query = ($('#mediaSearch')?.value || '').trim().toLowerCase();
    const category = $('#mediaCategoryFilter')?.value || '';
    const usage = $('#mediaUsageFilter')?.value || '';
    const rights = $('#mediaRightsFilter')?.value || '';
    const orientation = $('#mediaOrientationFilter')?.value || '';
    return (catalogData?.media || []).filter((media) => {
      if (category && media.category !== category) return false;
      if (usage && media.usageStatus !== usage) return false;
      if (rights && media.rightsStatus !== rights) return false;
      if (orientation && media.orientation !== orientation) return false;
      if (query && ![media.title,media.filename,media.alt,media.category,media.tags?.join(' '),media.notes].some((value) => String(value || '').toLowerCase().includes(query))) return false;
      return true;
    });
  }

  function assignToProduct(media, role) {
    if (!media) return;
    if (role === 'primary') currentImages.forEach((image) => { image.role = 'gallery'; });
    currentImages.push({ id:media.id, url:media.url, alt:media.alt || media.title || media.filename || '', role, displayOrder:currentImages.length + 1 });
    renderImages();
    showTab('products');
    setMessage($('#productStatusMessage'), 'Image assigned. Save the product to publish the change.', true);
  }

  function renderGlobalMedia() {
    if (!$('#mediaGrid')) return;
    const media = filteredMedia();
    $('#mediaCount').textContent = `${catalogData.media.length} total · ${media.length} shown`;
    if ($('#mediaFilterSummary')) $('#mediaFilterSummary').textContent = `${catalogData.media.filter(publishable).length} approved for governed website selection. Draft, restricted, and archived records remain visible here for review.`;
    $('#mediaGrid').innerHTML = media.map((item) => {
      const reason = approvalReason(item);
      return `<article class="border border-white/10 rounded-xl overflow-hidden bg-slate-950"><div class="aspect-[4/3] bg-black relative"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || item.title || item.filename)}" class="w-full h-full object-cover" style="object-position:${escapeHtml(String(item.focalPoint || 'center').replaceAll('_',' '))}"><span class="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded bg-slate-950/85">${escapeHtml(human(item.category || 'general'))}</span>${item.static ? '<span class="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded bg-blue-900/90">SOURCE</span>' : ''}</div><div class="p-4"><h3 class="font-bold line-clamp-2">${escapeHtml(item.title || item.filename || item.id)}</h3><p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapeHtml(item.alt || 'No alt text')}</p><div class="flex flex-wrap gap-2 mt-3 text-[10px]"><span class="border border-white/10 rounded-full px-2 py-1">${escapeHtml(human(item.usageStatus || 'draft'))}</span><span class="border border-white/10 rounded-full px-2 py-1">${escapeHtml(human(item.rightsStatus || 'unverified'))}</span><span class="border border-white/10 rounded-full px-2 py-1">${escapeHtml(human(item.orientation || 'unknown'))}</span></div>${reason ? `<p class="text-xs text-amber-300 mt-3">${escapeHtml(reason)}</p>` : '<p class="text-xs text-emerald-300 mt-3">Approved for governed website selection.</p>'}<div class="grid grid-cols-2 gap-2 mt-4"><button type="button" data-edit-global-media="${escapeHtml(item.id)}" class="border border-white/15 py-2 rounded-lg font-bold text-xs">EDIT / REVIEW</button><button type="button" data-copy-media="${escapeHtml(item.id)}" class="border border-white/15 py-2 rounded-lg font-bold text-xs">COPY URL</button><button type="button" data-use-global-media="${escapeHtml(item.id)}" data-role="primary" class="bg-amber-400 text-slate-950 py-2 rounded-lg font-bold text-xs">USE PRIMARY</button><button type="button" data-use-global-media="${escapeHtml(item.id)}" data-role="gallery" class="border border-white/15 py-2 rounded-lg font-bold text-xs">ADD GALLERY</button></div></div></article>`;
    }).join('') || '<p class="text-slate-400">No media match the current filters.</p>';
    $$('[data-edit-global-media]').forEach((button) => button.addEventListener('click', () => openMediaEditor(mediaById(button.dataset.editGlobalMedia))));
    $$('[data-copy-media]').forEach((button) => button.addEventListener('click', async () => { const item = mediaById(button.dataset.copyMedia); await navigator.clipboard.writeText(new URL(item.url, location.origin).href); button.textContent = 'COPIED'; setTimeout(() => { button.textContent = 'COPY URL'; }, 1400); }));
    $$('[data-use-global-media]').forEach((button) => button.addEventListener('click', () => assignToProduct(mediaById(button.dataset.useGlobalMedia), button.dataset.role)));
  }

  function mediaEditorMarkup(media) {
    return `<form id="globalMediaEditForm" class="space-y-5"><div class="grid sm:grid-cols-[180px_1fr] gap-5"><img src="${escapeHtml(media.url)}" alt="" class="w-full aspect-square object-cover rounded-xl bg-black"><div><p class="text-sm text-slate-400">${escapeHtml(media.filename || media.id)}</p><p class="text-xs text-slate-500 mt-2">${media.width || '—'} × ${media.height || '—'} · ${escapeHtml(human(media.orientation || 'unknown'))}${media.static ? ' · repository source' : ' · uploaded media'}</p><p class="text-xs text-slate-400 mt-4">${escapeHtml(media.cropPotential || '')}</p></div></div>
      <label><span class="label">MEDIA TITLE</span><input id="editMediaTitle" class="field" required value="${escapeHtml(media.title || media.filename || '')}"></label>
      <label><span class="label">ACCESSIBLE ALT TEXT</span><input id="editMediaAlt" class="field" required value="${escapeHtml(media.alt || '')}"></label>
      <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">CATEGORY</span><select id="editMediaCategory" class="field">${optionMarkup(categories,media.category)}</select></label><label><span class="label">USAGE STATUS</span><select id="editMediaUsage" class="field">${optionMarkup(usageStatuses,media.usageStatus)}</select></label></div>
      <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">RIGHTS / RELEASE STATUS</span><select id="editMediaRights" class="field">${optionMarkup(rightsStatuses,media.rightsStatus)}</select></label><label><span class="label">PRODUCT ACCURACY</span><select id="editMediaProduct" class="field">${optionMarkup(productStatuses,media.productAccuracyStatus)}</select></label></div>
      <label><span class="label">TAGS</span><input id="editMediaTags" class="field" value="${escapeHtml((media.tags || []).join(', '))}"></label>
      <div class="grid sm:grid-cols-2 gap-4"><label><span class="label">CREDIT / SOURCE</span><input id="editMediaCredit" class="field" value="${escapeHtml(media.credit || '')}"></label><label><span class="label">FOCAL POINT</span><select id="editMediaFocal" class="field">${optionMarkup(focalPoints,media.focalPoint)}</select></label></div>
      <label><span class="label">REVIEW NOTES</span><textarea id="editMediaNotes" class="field" rows="4">${escapeHtml(media.notes || '')}</textarea></label>
      <label><span class="label">RECOMMENDED USE</span><textarea id="editMediaRecommended" class="field" rows="3">${escapeHtml(media.recommendedUse || '')}</textarea></label>
      <div class="notice">Marking an asset Approved does not replace the need to retain the supporting license, release, or product-verification documentation.</div>
      <button class="w-full bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl">SAVE MEDIA REVIEW</button><p id="editMediaMessage" class="text-sm"></p></form>`;
  }

  function openMediaEditor(media) {
    if (!media) return;
    openDrawer('Media review', media.title || media.filename || media.id, mediaEditorMarkup(media));
    $('#globalMediaEditForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const result = await request('/.netlify/functions/admin-update-media', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ id:media.id, metadata:{
          title:$('#editMediaTitle').value, alt:$('#editMediaAlt').value, category:$('#editMediaCategory').value, usageStatus:$('#editMediaUsage').value,
          rightsStatus:$('#editMediaRights').value, productAccuracyStatus:$('#editMediaProduct').value, tags:$('#editMediaTags').value, credit:$('#editMediaCredit').value,
          focalPoint:$('#editMediaFocal').value, notes:$('#editMediaNotes').value, recommendedUse:$('#editMediaRecommended').value
        } }) });
        const index = catalogData.media.findIndex((item) => item.id === media.id);
        if (index >= 0) catalogData.media[index] = result.media;
        renderMedia();
        closeDrawer();
        if (typeof p4EnhanceContentForm === 'function' && priority4Data?.content) p4EnhanceContentForm();
      } catch (error) { setMessage($('#editMediaMessage'), error.message); }
    });
  }

  function pickerCards(items, current) {
    return items.map((media) => {
      const allowed = publishable(media);
      const reason = approvalReason(media);
      return `<button type="button" data-pick-global-media="${escapeHtml(media.id)}" ${allowed ? '' : 'disabled'} class="text-left border rounded-xl overflow-hidden ${media.url === current ? 'border-amber-400' : 'border-white/10'} ${allowed ? 'hover:border-amber-400' : 'opacity-45 cursor-not-allowed'}"><img src="${escapeHtml(media.url)}" alt="" class="w-full h-28 object-cover"><span class="block p-3"><strong class="block text-sm line-clamp-2">${escapeHtml(media.title || media.filename || media.id)}</strong><small class="block text-slate-400 mt-1">${escapeHtml(human(media.category || 'general'))}</small>${reason ? `<small class="block text-amber-300 mt-1">${escapeHtml(reason)}</small>` : ''}</span></button>`;
    }).join('');
  }

  window.openGlobalMediaPicker = function openGlobalMediaPicker({ title = 'Choose media', current = '', onSelect } = {}) {
    const body = `<div class="space-y-4"><div class="notice">Only approved assets with acceptable rights and product-accuracy review can be applied to governed website content.</div><div class="grid sm:grid-cols-2 gap-3"><input id="globalPickerSearch" class="field" placeholder="Search media"><select id="globalPickerCategory" class="field"><option value="">All categories</option>${optionMarkup(categories)}</select></div><div id="globalPickerGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-auto"></div></div>`;
    openDrawer(title, 'Global Site Media Library', body);
    const draw = () => {
      const query = $('#globalPickerSearch').value.trim().toLowerCase();
      const category = $('#globalPickerCategory').value;
      const items = (catalogData.media || []).filter((media) => (!category || media.category === category) && (!query || [media.title,media.filename,media.alt,media.tags?.join(' ')].some((value) => String(value || '').toLowerCase().includes(query))));
      $('#globalPickerGrid').innerHTML = pickerCards(items, current) || '<p class="text-slate-400">No media match.</p>';
      $$('[data-pick-global-media]').forEach((button) => button.addEventListener('click', () => { const media = mediaById(button.dataset.pickGlobalMedia); if (!publishable(media)) return; onSelect?.(media); closeDrawer(); }));
    };
    $('#globalPickerSearch').addEventListener('input', draw);
    $('#globalPickerCategory').addEventListener('change', draw);
    draw();
  };

  function attachPickerButton(input, label = 'Choose from Site Media Library') {
    if (!input || input.parentElement.querySelector('[data-global-media-picker]')) return;
    const wrapper = document.createElement('div');
    wrapper.dataset.globalMediaPicker = '1';
    wrapper.className = 'mt-2 grid grid-cols-[1fr_80px] gap-3 items-center';
    wrapper.innerHTML = `<button type="button" class="border border-white/15 px-4 py-3 rounded-xl font-bold text-left">${escapeHtml(label)}</button><img class="p4-media-preview invisible" alt="Selected media preview">`;
    const preview = wrapper.querySelector('img');
    const update = () => { preview.src = input.value || ''; preview.classList.toggle('invisible', !input.value); };
    wrapper.querySelector('button').addEventListener('click', () => openGlobalMediaPicker({ current:input.value, onSelect:(media) => { input.value = media.url; input.dispatchEvent(new Event('input', { bubbles:true })); update(); } }));
    input.addEventListener('input', update);
    input.insertAdjacentElement('afterend', wrapper);
    update();
  }

  if (typeof p4AttachMediaChooser === 'function') {
    p4AttachMediaChooser = function globalContentMediaChooser(input) {
      attachPickerButton(input, 'Choose approved site media');
    };
  }

  const previousRender = renderMedia;
  renderMedia = function globalMediaRenderer() {
    installMediaWorkspace();
    renderGlobalMedia();
  };

  installMediaWorkspace();
  if (catalogData?.media) renderGlobalMedia();
})();
