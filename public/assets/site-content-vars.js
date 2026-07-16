'use strict';
const IZHE_contentParams = new URLSearchParams(location.search);
const IZHE_contentPreview = IZHE_contentParams.get('contentPreview') === '1';
const IZHE_visualFrame = IZHE_contentParams.get('visualFrame') === '1';
const IZHE_contentToken = IZHE_contentPreview || IZHE_visualFrame ? localStorage.getItem('izhe-admin-token') || '' : '';
const IZHE_spacing = { compact: '3.75rem', standard: '5.5rem', generous: '7.5rem' };
const IZHE_overlayAlpha = { light: .38, medium: .62, strong: .82 };
const IZHE_text = (selector, value) => { const element = document.querySelector(selector); if (element && value !== undefined && value !== null) element.textContent = String(value); };
const IZHE_attr = (selector, name, value) => { const element = document.querySelector(selector); if (element && value) element.setAttribute(name, value); };
const IZHE_fieldsFor = (records, key) => records?.[key]?.fields || records?.[key] || {};

function IZHE_setVisible(section, visible, visualFrame) {
  if (!section) return;
  if (visible === false) {
    if (visualFrame) { section.hidden = false; section.classList.add('ve-hidden-preview'); }
    else section.hidden = true;
  } else { section.hidden = false; section.classList.remove('ve-hidden-preview'); }
}
function IZHE_alignBlock(element, alignment) {
  if (!element) return;
  element.style.textAlign = alignment || 'left';
  element.style.marginLeft = alignment === 'right' || alignment === 'center' ? 'auto' : '';
  element.style.marginRight = alignment === 'left' || alignment === 'center' ? 'auto' : '';
}
function IZHE_applyBackground(section, image, kind, overlay = 'strong', focal = 'center') {
  if (!section || !image) return;
  const alpha = IZHE_overlayAlpha[overlay] ?? IZHE_overlayAlpha.strong;
  const gradients = {
    hero: `linear-gradient(90deg,rgba(2,6,23,${Math.min(.96,alpha + .12)}) 0%,rgba(2,6,23,${alpha}) 48%,rgba(2,6,23,${Math.max(.1,alpha - .48)}) 100%)`,
    book: `linear-gradient(90deg,rgba(2,6,23,${Math.min(.98,alpha + .14)}),rgba(2,6,23,${alpha}) 58%,rgba(2,6,23,${Math.max(.08,alpha - .55)}))`,
    church: `linear-gradient(90deg,rgba(2,6,23,${Math.min(.98,alpha + .14)}),rgba(2,6,23,${alpha}) 55%,rgba(2,6,23,${Math.max(.18,alpha - .4)}))`
  };
  section.style.backgroundImage = `${gradients[kind]},url("${String(image).replaceAll('"','%22')}")`;
  section.style.backgroundPosition = focal || 'center';
}
