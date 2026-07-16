'use strict';
function IZHE_applyVisibilityAndOrder(records, options = {}) {
  const layout = IZHE_fieldsFor(records, 'site-layout');
  const hero = document.getElementById('top');
  const story = document.getElementById('story');
  const book = document.getElementById('book');
  const collection = document.getElementById('collection');
  const give = document.getElementById('give-one');
  const church = document.getElementById('church');
  IZHE_setVisible(hero, layout.heroVisible !== false, options.visualFrame);
  IZHE_setVisible(story, layout.storyVisible !== false, options.visualFrame);
  IZHE_setVisible(book, layout.bookVisible !== false, options.visualFrame);
  IZHE_setVisible(collection, layout.collectionVisible !== false, options.visualFrame);
  IZHE_setVisible(give, layout.giveOneVisible !== false, options.visualFrame);
  IZHE_setVisible(church, layout.churchVisible !== false, options.visualFrame);
  const main = document.getElementById('main-content');
  const redeem = document.getElementById('redeem');
  const ordered = [[story, Number(layout.storyOrder || 1)], [book, Number(layout.bookOrder || 2)], [collection, Number(layout.collectionOrder || 3)], [give, Number(layout.giveOneOrder || 4)], [church, Number(layout.churchOrder || 5)]].sort((a, b) => a[1] - b[1]);
  if (main && redeem) ordered.forEach(([section]) => section && main.insertBefore(section, redeem));
}
