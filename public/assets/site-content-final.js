'use strict';
function IZHE_applyContent(records, options = {}) {
  IZHE_applyHeroAndStory(records);
  IZHE_applyBookGiveChurch(records);
  IZHE_applyLayout(records, options);
  const announcement = IZHE_fieldsFor(records, 'site-announcement');
  const existing = document.getElementById('siteAnnouncementBanner'); if (existing) existing.remove();
  if (announcement.message) { const banner = document.createElement('div'); banner.id = 'siteAnnouncementBanner'; banner.className = 'fixed top-0 inset-x-0 z-[90] bg-brand-gold text-brand-darker px-5 py-2.5 text-center text-sm font-bold'; banner.append(document.createTextNode(announcement.message)); if (announcement.linkUrl && announcement.linkLabel) { const link = document.createElement('a'); link.className = 'underline ml-2'; link.href = announcement.linkUrl; link.textContent = announcement.linkLabel; banner.append(link); } document.body.prepend(banner); const navbar = document.querySelector('#navbar'); if (navbar) navbar.style.top = `${banner.offsetHeight}px`; }
}
window.IZHE_applyContent = IZHE_applyContent;
