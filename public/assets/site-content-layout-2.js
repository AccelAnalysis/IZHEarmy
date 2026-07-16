'use strict';
function IZHE_applyLayoutPresets(records) {
  const layout = IZHE_fieldsFor(records, 'site-layout');
  const hero = document.getElementById('top');
  const story = document.getElementById('story');
  const book = document.getElementById('book');
  const collection = document.getElementById('collection');
  const give = document.getElementById('give-one');
  const church = document.getElementById('church');
  if (hero) hero.style.minHeight = ({ compact: '72svh', standard: '88svh', tall: '100svh' })[layout.heroHeight] || '100svh';
  IZHE_alignBlock(document.querySelector('#top .max-w-3xl'), layout.heroAlignment || 'left');
  const heroButtons = document.querySelector('#top .max-w-3xl > div:last-child');
  if (heroButtons) heroButtons.style.justifyContent = layout.heroAlignment === 'center' ? 'center' : layout.heroAlignment === 'right' ? 'flex-end' : 'flex-start';
  [story, book, collection, give, church].forEach((section) => { if (section) section.style.paddingBlock = ''; });
  if (story) story.style.paddingBlock = IZHE_spacing[layout.storySpacing] || IZHE_spacing.standard;
  if (collection) collection.style.paddingBlock = IZHE_spacing[layout.collectionSpacing] || IZHE_spacing.standard;
  if (give) give.style.paddingBlock = IZHE_spacing[layout.giveOneSpacing] || IZHE_spacing.standard;
  if (church) church.style.paddingBlock = IZHE_spacing[layout.churchSpacing] || IZHE_spacing.standard;
  const bookInner = book?.querySelector(':scope > div');
  if (bookInner) bookInner.style.paddingBlock = IZHE_spacing[layout.bookSpacing] || IZHE_spacing.standard;
  const storyGrid = story?.querySelector('.lg\\:grid-cols-2');
  if (storyGrid) { const children = [...storyGrid.children]; if (children[0] && children[1]) { children[0].style.order = layout.storyImagePosition === 'right' ? '2' : '1'; children[1].style.order = layout.storyImagePosition === 'right' ? '1' : '2'; children[1].style.textAlign = layout.storyAlignment || 'left'; } }
  const bookCard = book?.querySelector('.glass');
  if (bookCard) { bookCard.style.textAlign = layout.bookAlignment || 'left'; bookCard.style.marginLeft = layout.bookAlignment === 'right' || layout.bookAlignment === 'center' ? 'auto' : ''; bookCard.style.marginRight = layout.bookAlignment === 'center' ? 'auto' : ''; }
  const giveHeading = give?.querySelector('.max-w-3xl');
  if (giveHeading) { giveHeading.style.textAlign = layout.giveOneAlignment || 'left'; giveHeading.style.marginInline = layout.giveOneAlignment === 'center' ? 'auto' : ''; }
  const giveGrid = give?.querySelector('.lg\\:grid-cols-12');
  if (giveGrid) { const children = [...giveGrid.children]; if (children[0] && children[1]) { children[0].style.order = layout.giveOneImagePosition === 'left' ? '2' : '1'; children[1].style.order = layout.giveOneImagePosition === 'left' ? '1' : '2'; } }
  const churchContent = church?.querySelector('.lg\\:grid-cols-2 > div:first-child');
  if (churchContent) churchContent.style.textAlign = layout.churchAlignment || 'left';
}
function IZHE_applyLayout(records, options = {}) {
  IZHE_applyVisibilityAndOrder(records, options);
  IZHE_applyLayoutPresets(records);
}
