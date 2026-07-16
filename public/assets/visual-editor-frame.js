'use strict';
(() => {
  if (new URLSearchParams(location.search).get('visualFrame') !== '1') return;
  const parentOrigin = location.origin;
  const mappings = [
    ['#top .max-w-3xl > p:nth-of-type(1)','home-hero','eyebrow','Hero eyebrow','text'],
    ['#top .max-w-3xl > p:nth-of-type(2)','home-hero','question','Hero question','text'],
    ['#top .max-w-3xl > p:nth-of-type(3)','home-hero','body','Hero supporting message','text'],
    ['#top .max-w-3xl > div:last-child a:nth-child(1)','home-hero','primaryLabel','Primary button','button','primaryTarget'],
    ['#top .max-w-3xl > div:last-child a:nth-child(2)','home-hero','secondaryLabel','Secondary button','button','secondaryTarget'],
    ['#story .relative.group .absolute.bottom-7 p:nth-child(1)','home-story','imageEyebrow','Story image eyebrow','text'],
    ['#story .relative.group .absolute.bottom-7 p:nth-child(2)','home-story','imageStatement','Story image statement','text'],
    ['#story .lg\\:grid-cols-2 > div:nth-child(2) span','home-story','eyebrow','Story eyebrow','text'],
    ['#story .space-y-5 p:nth-child(1)','home-story','paragraph1','Story first paragraph','text'],
    ['#story .space-y-5 p:nth-child(2)','home-story','paragraph2','Story second paragraph','text'],
    ['#story .grid.sm\\:grid-cols-2 > div:nth-child(1) h3','home-story','card1Title','First feature title','text'],
    ['#story .grid.sm\\:grid-cols-2 > div:nth-child(1) p','home-story','card1Body','First feature text','text'],
    ['#story .grid.sm\\:grid-cols-2 > div:nth-child(2) h3','home-story','card2Title','Second feature title','text'],
    ['#story .grid.sm\\:grid-cols-2 > div:nth-child(2) p','home-story','card2Body','Second feature text','text'],
    ['#book .glass span','home-book','eyebrow','Book eyebrow','text'],
    ['#book .glass h2','home-book','heading','Book title','text'],
    ['#book .glass > p:nth-of-type(1)','home-book','subtitle','Book subtitle','text'],
    ['#book .glass > p:nth-of-type(2)','home-book','body','Book introduction','text'],
    ['#book .grid.sm\\:grid-cols-3 > div:nth-child(1) strong','home-book','readTitle','Read feature title','text'],
    ['#book .grid.sm\\:grid-cols-3 > div:nth-child(1) span','home-book','readBody','Read feature text','text'],
    ['#book .grid.sm\\:grid-cols-3 > div:nth-child(2) strong','home-book','reflectTitle','Reflect feature title','text'],
    ['#book .grid.sm\\:grid-cols-3 > div:nth-child(2) span','home-book','reflectBody','Reflect feature text','text'],
    ['#book .grid.sm\\:grid-cols-3 > div:nth-child(3) strong','home-book','shareTitle','Share feature title','text'],
    ['#book .grid.sm\\:grid-cols-3 > div:nth-child(3) span','home-book','shareBody','Share feature text','text'],
    ['#bookPreviewButton','home-book','previewLabel','Book preview button','button'],
    ['#teachingLibraryButton','home-book','libraryLabel','Teaching library button','button'],
    ['#give-one .max-w-3xl span','home-give-one','eyebrow','Give One eyebrow','text'],
    ['#give-one .max-w-3xl h2','home-give-one','heading','Give One heading','text'],
    ['#give-one .max-w-3xl p','home-give-one','body','Give One explanation','text'],
    ['#give-one .lg\\:col-span-7 > div:nth-child(1) h3','home-give-one','step1Title','Step 1 title','text'],
    ['#give-one .lg\\:col-span-7 > div:nth-child(1) p','home-give-one','step1Body','Step 1 text','text'],
    ['#give-one .lg\\:col-span-7 > div:nth-child(2) h3','home-give-one','step2Title','Step 2 title','text'],
    ['#give-one .lg\\:col-span-7 > div:nth-child(2) p','home-give-one','step2Body','Step 2 text','text'],
    ['#give-one .lg\\:col-span-7 > div:nth-child(3) h3','home-give-one','step3Title','Step 3 title','text'],
    ['#give-one .lg\\:col-span-7 > div:nth-child(3) p','home-give-one','step3Body','Step 3 text','text'],
    ['#give-one .lg\\:col-span-5 .absolute.bottom-0 p:nth-of-type(1)','home-give-one','purposeEyebrow','Purpose eyebrow','text'],
    ['#give-one .lg\\:col-span-5 .absolute.bottom-0 h3','home-give-one','purposeHeading','Purpose heading','text'],
    ['#give-one .lg\\:col-span-5 .absolute.bottom-0 p:nth-of-type(2)','home-give-one','purposeBody','Purpose description','text'],
    ['#church .lg\\:grid-cols-2 > div:first-child > span','home-church','eyebrow','Church section eyebrow','text'],
    ['#church .lg\\:grid-cols-2 > div:first-child > h2','home-church','heading','Church section heading','text'],
    ['#church .lg\\:grid-cols-2 > div:first-child .space-y-5 p:nth-child(1)','home-church','body','Church invitation','text'],
    ['#church .lg\\:grid-cols-2 > div:first-child .space-y-5 p:nth-child(2)','home-church','secondParagraph','Ministry support explanation','text'],
    ['#church .grid.grid-cols-2 span:nth-child(1)','home-church','pillar1','First church pillar','text'],
    ['#church .grid.grid-cols-2 span:nth-child(2)','home-church','pillar2','Second church pillar','text'],
    ['#church .grid.grid-cols-2 span:nth-child(3)','home-church','pillar3','Third church pillar','text'],
    ['#church .grid.grid-cols-2 span:nth-child(4)','home-church','pillar4','Fourth church pillar','text'],
    ['#churchForm button[type="submit"]','home-church','submitLabel','Church form button','button']
  ];
  const backgrounds = [
    ['top','home-hero','backgroundImage','Hero background'],
    ['book','home-book','backgroundImage','Book background'],
    ['church','home-church','backgroundImage','Church background']
  ];
  const foregroundImages = [
    { container: '#story .relative.group', image: '#story img', key: 'home-story', field: 'image', label: 'Story image', altField: 'imageAlt', focalField: 'imageFocalPoint', fitField: 'imageFit', overlayField: 'imageOverlay' },
    { container: '#give-one .lg\\:col-span-5', image: '#give-one .lg\\:col-span-5 img', key: 'home-give-one', field: 'image', label: 'Give One purpose image', altField: 'imageAlt', focalField: 'imageFocalPoint', fitField: 'imageFit', overlayField: 'imageOverlay' }
  ];
  const sections = ['top','story','book','collection','give-one','church'];
  let records = {};

  function send(message) { parent.postMessage(message, parentOrigin); }
  function selectionFrom(element) {
    return {
      kind: element.dataset.veKind,
      key: element.dataset.veKey,
      field: element.dataset.veField,
      label: element.dataset.veLabel,
      targetField: element.dataset.veTargetField || '',
      altField: element.dataset.veAltField || '',
      focalField: element.dataset.veFocalField || '',
      fitField: element.dataset.veFitField || '',
      overlayField: element.dataset.veOverlayField || ''
    };
  }
  function addStyles() {
    if (document.getElementById('visualFrameStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="visualFrameStyles">body{padding-top:34px!important}.ve-edit-bar{position:fixed;top:0;inset-inline:0;height:34px;background:#fbbf24;color:#020617;z-index:9999;display:flex;align-items:center;justify-content:center;font:800 11px/1 Inter,sans-serif;letter-spacing:.12em}.ve-editable{outline:1px dashed transparent;outline-offset:5px;cursor:text}.ve-editable:hover,.ve-selected{outline:2px solid #fbbf24!important;background-color:rgba(251,191,36,.07)}.ve-image{cursor:pointer;outline:2px dashed transparent;outline-offset:4px}.ve-image:hover{outline-color:#fbbf24}.ve-section-handle,.ve-background-handle,.ve-image-handle,.ve-locked-label{position:absolute;z-index:9990;border:0;border-radius:999px;padding:7px 10px;font:800 10px/1 Inter,sans-serif;letter-spacing:.08em;box-shadow:0 8px 24px rgba(0,0,0,.35)}.ve-section-handle{top:12px;left:12px;background:#fbbf24;color:#020617}.ve-background-handle{top:12px;right:12px;background:#fff;color:#020617}.ve-image-handle{top:12px;right:12px;background:#fbbf24;color:#020617}.ve-image-handle:hover,.ve-background-handle:hover,.ve-section-handle:hover{transform:translateY(-1px)}.ve-locked-label{top:12px;right:12px;background:#334155;color:#e2e8f0}.ve-hidden-preview{opacity:.35!important;display:block!important}.ve-hidden-preview::after{content:'HIDDEN WHEN PUBLISHED';position:absolute;inset:0;border:3px dashed #f87171;pointer-events:none;z-index:9980}</style>`);
    document.body.insertAdjacentHTML('afterbegin','<div class="ve-edit-bar">PROTECTED VISUAL EDIT MODE · CLICK GOLD-OUTLINED CONTENT OR CHANGE IMAGE</div>');
  }
  function prepareStoryHeading() {
    const heading = document.querySelector('#story h2');
    if (!heading || heading.querySelector('[data-ve-field="heading"]')) return;
    const first = [...heading.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (first) { const span = document.createElement('span'); span.textContent = first.textContent; first.replaceWith(span); span.dataset.veGenerated = 'story-heading'; }
  }
  function assignSelectionData(element, config, kind = 'image') {
    Object.assign(element.dataset, {
      veKey: config.key,
      veField: config.field,
      veLabel: config.label,
      veKind: kind,
      veAltField: config.altField || '',
      veFocalField: config.focalField || '',
      veFitField: config.fitField || '',
      veOverlayField: config.overlayField || ''
    });
  }
  function annotateForegroundImages() {
    foregroundImages.forEach((config) => {
      const container = document.querySelector(config.container);
      const image = document.querySelector(config.image);
      if (!container || !image) return;
      assignSelectionData(image, config);
      image.classList.add('ve-image');
      let button = container.querySelector(`:scope > .ve-image-handle[data-ve-field="${config.field}"]`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 've-image-handle';
        button.textContent = 'CHANGE IMAGE';
        assignSelectionData(button, config);
        container.append(button);
      }
    });
  }
  function annotate() {
    addStyles(); prepareStoryHeading();
    const generatedHeading = document.querySelector('[data-ve-generated="story-heading"]');
    const effectiveMappings = [...mappings];
    if (generatedHeading) effectiveMappings.push(['[data-ve-generated="story-heading"]','home-story','heading','Story heading','text']);
    const accent = document.querySelector('#story h2 span.italic');
    if (accent) effectiveMappings.push(['#story h2 span.italic','home-story','accent','Story accent line','text']);
    const formContainer = document.getElementById('churchForm')?.parentElement;
    const formTitle = formContainer?.querySelector(':scope > h3');
    const formIntro = formContainer?.querySelector(':scope > p');
    if (formTitle) effectiveMappings.push(['#churchForm','home-church','formTitle','Church form title','manual']);
    if (formIntro) effectiveMappings.push(['#churchForm','home-church','formIntro','Church form introduction','manual']);
    for (const [selector,key,field,label,kind,targetField] of effectiveMappings) {
      let element = document.querySelector(selector);
      if (kind === 'manual' && field === 'formTitle') element = formTitle;
      if (kind === 'manual' && field === 'formIntro') element = formIntro;
      if (!element) continue;
      element.dataset.veKey = key; element.dataset.veField = field; element.dataset.veLabel = label; element.dataset.veKind = kind; if (targetField) element.dataset.veTargetField = targetField;
      if (kind === 'text' || kind === 'manual') { element.contentEditable = 'true'; element.spellcheck = true; element.dataset.veKind = 'text'; element.classList.add('ve-editable'); }
      else element.classList.add(kind === 'image' ? 've-image' : 've-editable');
    }
    annotateForegroundImages();
    for (const sectionId of sections) {
      const section = document.getElementById(sectionId); if (!section || section.querySelector(':scope > .ve-section-handle')) continue;
      if (getComputedStyle(section).position === 'static') section.style.position = 'relative';
      const button = document.createElement('button'); button.type = 'button'; button.className = 've-section-handle'; button.textContent = 'SECTION SETTINGS'; button.dataset.veSection = sectionId; section.append(button);
    }
    for (const [sectionId,key,field,label] of backgrounds) {
      const section = document.getElementById(sectionId); if (!section || section.querySelector(`.ve-background-handle[data-ve-field="${field}"]`)) continue;
      const button = document.createElement('button'); button.type='button'; button.className='ve-background-handle'; button.textContent='CHANGE BACKGROUND'; Object.assign(button.dataset,{veKey:key,veField:field,veLabel:label,veKind:'background'}); section.append(button);
    }
    [['collection','CATALOG-MANAGED PRODUCTS'],['redeem','LOCKED OPERATIONAL FORM']].forEach(([id,label]) => { const section=document.getElementById(id); if(!section||section.querySelector('.ve-locked-label')) return; if(getComputedStyle(section).position==='static')section.style.position='relative'; const badge=document.createElement('span');badge.className='ve-locked-label';badge.textContent=label;section.append(badge); });
  }
  function applyRecords(next) {
    records = next || {};
    if (window.IZHE_applyContent) window.IZHE_applyContent(records, { visualFrame: true });
    setTimeout(annotate, 30);
  }
  document.addEventListener('click', (event) => {
    const sectionButton = event.target.closest('[data-ve-section]');
    if (sectionButton) { event.preventDefault(); event.stopPropagation(); send({ type:'ve:select', selection:{kind:'section',sectionId:sectionButton.dataset.veSection} }); return; }
    const editable = event.target.closest('[data-ve-field]');
    if (editable) { if (editable.dataset.veKind !== 'text') event.preventDefault(); event.stopPropagation(); document.querySelectorAll('.ve-selected').forEach((item)=>item.classList.remove('ve-selected')); editable.classList.add('ve-selected'); send({ type:'ve:select', selection:selectionFrom(editable) }); return; }
    if (event.target.closest('a,button,input,select,textarea,form')) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  document.addEventListener('input', (event) => {
    const element = event.target.closest('[data-ve-kind="text"]'); if (!element) return;
    send({ type:'ve:fieldInput', key:element.dataset.veKey, field:element.dataset.veField, value:element.textContent.replace(/\s+/g,' ').trimStart() });
  });
  document.addEventListener('focusout', (event) => { if (event.target.closest('[data-ve-kind="text"]')) send({ type:'ve:fieldCommit' }); });
  document.addEventListener('submit', (event) => event.preventDefault(), true);
  window.addEventListener('message', (event) => {
    if (event.origin !== parentOrigin || event.source !== parent) return;
    const message = event.data || {};
    if (message.type === 've:hydrate') applyRecords(message.records);
    if (message.type === 've:updateField') {
      if (!records[message.key]) return; records[message.key].fields[message.field] = message.value; applyRecords(records);
    }
  });
  const ready = () => { annotate(); send({ type:'ve:ready' }); };
  window.addEventListener('izhe:content-ready', ready, { once:true });
  setTimeout(ready, 1800);
})();