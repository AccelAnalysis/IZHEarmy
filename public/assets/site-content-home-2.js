'use strict';
function IZHE_applyBookGiveChurch(records) {
  const layout = IZHE_fieldsFor(records, 'site-layout');
  const book = IZHE_fieldsFor(records, 'home-book');
  IZHE_text('#book .glass span', book.eyebrow); IZHE_text('#book .glass h2', book.heading);
  const paragraphs = document.querySelectorAll('#book .glass > p'); if (paragraphs[0]) paragraphs[0].textContent = book.subtitle || ''; if (paragraphs[1]) paragraphs[1].textContent = book.body || '';
  IZHE_text('#bookPreviewButton', book.previewLabel);
  [['read',1],['reflect',2],['share',3]].forEach(([prefix,index]) => { IZHE_text(`#book .grid.sm\\:grid-cols-3 > div:nth-child(${index}) strong`, book[`${prefix}Title`]); IZHE_text(`#book .grid.sm\\:grid-cols-3 > div:nth-child(${index}) span`, book[`${prefix}Body`]); });
  IZHE_applyBackground(document.getElementById('book'), book.backgroundImage, 'book', layout.bookOverlay);
  let libraryButton = document.querySelector('#teachingLibraryButton');
  if (!libraryButton) { libraryButton = document.createElement('a'); libraryButton.id = 'teachingLibraryButton'; libraryButton.href = '/learn/'; libraryButton.className = 'inline-block ml-0 sm:ml-3 mt-3 sm:mt-0 border border-brand-gold text-brand-gold px-7 py-3.5 rounded-full font-bold hover:bg-brand-gold hover:text-brand-darker transition-colors'; document.querySelector('#bookPreviewButton')?.insertAdjacentElement('afterend', libraryButton); }
  libraryButton.textContent = book.libraryLabel || 'EXPLORE THE TEACHING LIBRARY';
  const give = IZHE_fieldsFor(records, 'home-give-one');
  IZHE_text('#give-one .max-w-3xl span', give.eyebrow); IZHE_text('#give-one .max-w-3xl h2', give.heading); IZHE_text('#give-one .max-w-3xl p', give.body);
  for (let index = 1; index <= 3; index += 1) { IZHE_text(`#give-one .lg\\:col-span-7 > div:nth-child(${index}) h3`, give[`step${index}Title`]); IZHE_text(`#give-one .lg\\:col-span-7 > div:nth-child(${index}) p`, give[`step${index}Body`]); }
  const giveImage = document.querySelector('#give-one .lg\\:col-span-5 img'); if (giveImage && give.image) giveImage.src = give.image; if (giveImage && give.imageAlt !== undefined) giveImage.alt = give.imageAlt;
  IZHE_text('#give-one .lg\\:col-span-5 .absolute.bottom-0 p:nth-of-type(1)', give.purposeEyebrow); IZHE_text('#give-one .lg\\:col-span-5 .absolute.bottom-0 h3', give.purposeHeading); IZHE_text('#give-one .lg\\:col-span-5 .absolute.bottom-0 p:nth-of-type(2)', give.purposeBody);
  const church = IZHE_fieldsFor(records, 'home-church');
  IZHE_text('#church .lg\\:grid-cols-2 > div:first-child > span', church.eyebrow); IZHE_text('#church .lg\\:grid-cols-2 > div:first-child > h2', church.heading);
  IZHE_text('#church .lg\\:grid-cols-2 > div:first-child .space-y-5 p:nth-child(1)', church.body); IZHE_text('#church .lg\\:grid-cols-2 > div:first-child .space-y-5 p:nth-child(2)', church.secondParagraph);
  for (let index = 1; index <= 4; index += 1) IZHE_text(`#church .grid.grid-cols-2 span:nth-child(${index})`, church[`pillar${index}`]);
  const form = document.getElementById('churchForm'); if (form) { IZHE_text('#churchForm button[type="submit"]', church.submitLabel); const container = form.parentElement; const title = container?.querySelector(':scope > h3'); const intro = container?.querySelector(':scope > p'); if (title && church.formTitle !== undefined) title.textContent = church.formTitle; if (intro && church.formIntro !== undefined) intro.textContent = church.formIntro; }
  IZHE_applyBackground(document.getElementById('church'), church.backgroundImage, 'church', layout.churchOverlay);
}
