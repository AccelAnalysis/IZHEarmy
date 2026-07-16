'use strict';
function IZHE_applyHeroAndStory(records) {
  const seo = IZHE_fieldsFor(records, 'site-seo');
  if (seo.title) document.title = seo.title;
  IZHE_attr('meta[name="description"]', 'content', seo.description);
  IZHE_attr('meta[property="og:title"]', 'content', seo.socialTitle || seo.title);
  IZHE_attr('meta[property="og:description"]', 'content', seo.socialDescription || seo.description);
  IZHE_attr('meta[property="og:image"]', 'content', seo.socialImage);
  const layout = IZHE_fieldsFor(records, 'site-layout');
  const hero = IZHE_fieldsFor(records, 'home-hero');
  IZHE_text('#top .max-w-3xl > p:nth-of-type(1)', hero.eyebrow);
  IZHE_text('#top .max-w-3xl > p:nth-of-type(2)', hero.question);
  IZHE_text('#top .max-w-3xl > p:nth-of-type(3)', hero.body);
  const heroLinks = document.querySelectorAll('#top .max-w-3xl > div:last-child a');
  if (heroLinks[0]) { if (hero.primaryLabel !== undefined) heroLinks[0].childNodes[0].textContent = hero.primaryLabel; if (hero.primaryTarget) heroLinks[0].href = hero.primaryTarget; }
  if (heroLinks[1]) { if (hero.secondaryLabel !== undefined) heroLinks[1].childNodes[0].textContent = `${hero.secondaryLabel} `; if (hero.secondaryTarget) heroLinks[1].href = hero.secondaryTarget; }
  IZHE_applyBackground(document.getElementById('top'), hero.backgroundImage, 'hero', layout.heroOverlay, layout.heroFocalPoint);
  const story = IZHE_fieldsFor(records, 'home-story');
  IZHE_text('#story .lg\\:grid-cols-2 > div:nth-child(2) span', story.eyebrow);
  const heading = document.querySelector('#story .lg\\:grid-cols-2 > div:nth-child(2) h2');
  if (heading && (story.heading !== undefined || story.accent !== undefined)) { heading.replaceChildren(document.createTextNode(story.heading || '')); heading.append(document.createElement('br')); const accent = document.createElement('span'); accent.className = 'italic text-brand-gold'; accent.textContent = story.accent || ''; heading.append(accent); }
  IZHE_text('#story .space-y-5 p:nth-child(1)', story.paragraph1);
  IZHE_text('#story .space-y-5 p:nth-child(2)', story.paragraph2);
  const storyImage = document.querySelector('#story img');
  const storyOverlay = document.querySelector('#story .relative.group > .absolute.inset-0');
  IZHE_applyForegroundImage(storyImage, storyOverlay, story, 'story');
  IZHE_text('#story .relative.group .absolute.bottom-7 p:nth-child(1)', story.imageEyebrow);
  IZHE_text('#story .relative.group .absolute.bottom-7 p:nth-child(2)', story.imageStatement);
  IZHE_text('#story .grid.sm\\:grid-cols-2 > div:nth-child(1) h3', story.card1Title);
  IZHE_text('#story .grid.sm\\:grid-cols-2 > div:nth-child(1) p', story.card1Body);
  IZHE_text('#story .grid.sm\\:grid-cols-2 > div:nth-child(2) h3', story.card2Title);
  IZHE_text('#story .grid.sm\\:grid-cols-2 > div:nth-child(2) p', story.card2Body);
}