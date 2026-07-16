'use strict';
(() => {
  const categories = ['brand_mark','model_lifestyle','apparel_product','book','teaching','church','give_one','campaign','social','general'];
  const human = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const allowedForSite = (media) => Boolean(media && media.usageStatus === 'approved' && !['unverified','pending_release','restricted'].includes(media.rightsStatus));
  const accurateForProduct = (media) => allowedForSite(media) && (media.category !== 'apparel_product' || media.productAccuracyStatus === 'accurate');
  const optionMarkup = (values) => values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(human(value))}</option>`).join('');
  const reason = (media) => {
    if (media.usageStatus !== 'approved') return `Usage status: ${human(media.usageStatus || 'draft')}`;
    if (['unverified','pending_release','restricted'].includes(media.rightsStatus)) return `Rights status: ${human(media.rightsStatus)}`;
    if (!accurateForProduct(media) && media.category === 'apparel_product') return 'Approved for site/editorial use only';
    return 'Approved for site use';
  };

  window.openGlobalMediaPicker = function openEditorialMediaPicker({ title = 'Choose media', current = '', onSelect } = {}) {
    const body = `<div class="space-y-4"><div class="notice">Approved assets with acceptable rights can be used in website content. Apparel concepts and legacy flat lays are enabled for editorial sections but remain restricted from current product listings until product accuracy is verified.</div><div class="grid sm:grid-cols-2 gap-3"><input id="globalPickerSearch" class="field" placeholder="Search media"><select id="globalPickerCategory" class="field"><option value="">All categories</option>${optionMarkup(categories)}</select></div><div id="globalPickerGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-auto"></div></div>`;
    openDrawer(title, 'Global Site Media Library', body);
    const draw = () => {
      const query = $('#globalPickerSearch').value.trim().toLowerCase();
      const category = $('#globalPickerCategory').value;
      const items = (catalogData?.media || []).filter((media) => (!category || media.category === category) && (!query || [media.title,media.filename,media.alt,media.tags?.join(' ')].some((value) => String(value || '').toLowerCase().includes(query))));
      $('#globalPickerGrid').innerHTML = items.map((media) => {
        const allowed = allowedForSite(media);
        return `<button type="button" data-pick-editorial-media="${escapeHtml(media.id)}" ${allowed ? '' : 'disabled'} class="text-left border rounded-xl overflow-hidden ${media.url === current ? 'border-amber-400' : 'border-white/10'} ${allowed ? 'hover:border-amber-400' : 'opacity-45 cursor-not-allowed'}"><img src="${escapeHtml(media.url)}" alt="" class="w-full h-28 object-cover"><span class="block p-3"><strong class="block text-sm line-clamp-2">${escapeHtml(media.title || media.filename || media.id)}</strong><small class="block text-slate-400 mt-1">${escapeHtml(human(media.category || 'general'))}</small><small class="block ${allowed ? 'text-emerald-300' : 'text-amber-300'} mt-1">${escapeHtml(reason(media))}</small></span></button>`;
      }).join('') || '<p class="text-slate-400">No media match.</p>';
      $$('[data-pick-editorial-media]').forEach((button) => button.addEventListener('click', () => {
        const media = (catalogData.media || []).find((item) => item.id === button.dataset.pickEditorialMedia);
        if (!allowedForSite(media)) return;
        onSelect?.(media);
        closeDrawer();
      }));
    };
    $('#globalPickerSearch').addEventListener('input', draw);
    $('#globalPickerCategory').addEventListener('change', draw);
    draw();
  };
})();
