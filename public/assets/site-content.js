'use strict';
(async () => {
  const preview = new URLSearchParams(location.search).get('contentPreview') === '1';
  const token = preview ? localStorage.getItem('izhe-admin-token') || '' : '';
  try {
    const response = await fetch(`/.netlify/functions/public-content${preview ? '?preview=1' : ''}`, { headers: preview && token ? { authorization: `Bearer ${token}` } : {} });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Website content could not be loaded.');
    const record = (key) => data.records?.[key]?.fields || {};
    const text = (selector, value) => { const element = document.querySelector(selector); if (element && value) element.textContent = value; };
    const attr = (selector, name, value) => { const element = document.querySelector(selector); if (element && value) element.setAttribute(name, value); };

    const seo = record('site-seo');
    if (seo.title) document.title = seo.title;
    attr('meta[name="description"]', 'content', seo.description);
    attr('meta[property="og:title"]', 'content', seo.socialTitle || seo.title);
    attr('meta[property="og:description"]', 'content', seo.socialDescription || seo.description);
    attr('meta[property="og:image"]', 'content', seo.socialImage);

    const hero = record('home-hero');
    text('#top .max-w-3xl > p:nth-of-type(1)', hero.eyebrow);
    text('#top .max-w-3xl > p:nth-of-type(2)', hero.question);
    text('#top .max-w-3xl > p:nth-of-type(3)', hero.body);
    const heroLinks = document.querySelectorAll('#top .max-w-3xl > div:last-child a');
    if (heroLinks[0]) { if (hero.primaryLabel) heroLinks[0].textContent = hero.primaryLabel; if (hero.primaryTarget) heroLinks[0].href = hero.primaryTarget; }
    if (heroLinks[1]) { if (hero.secondaryLabel) heroLinks[1].textContent = hero.secondaryLabel; if (hero.secondaryTarget) heroLinks[1].href = hero.secondaryTarget; }
    if (hero.backgroundImage) document.querySelector('#top').style.backgroundImage = `linear-gradient(90deg,rgba(2,6,23,.94) 0%,rgba(2,6,23,.68) 48%,rgba(2,6,23,.18) 100%),url("${hero.backgroundImage.replaceAll('"', '%22')}")`;

    const story = record('home-story');
    text('#story .lg\\:grid-cols-2 > div:nth-child(2) span', story.eyebrow);
    const storyHeading = document.querySelector('#story .lg\\:grid-cols-2 > div:nth-child(2) h2');
    if (storyHeading && (story.heading || story.accent)) {
      storyHeading.replaceChildren(document.createTextNode(story.heading || ''));
      storyHeading.append(document.createElement('br'));
      const accent = document.createElement('span');
      accent.className = 'italic text-brand-gold';
      accent.textContent = story.accent || '';
      storyHeading.append(accent);
    }
    const storyParagraphs = document.querySelectorAll('#story .space-y-5 p');
    if (storyParagraphs[0] && story.paragraph1) storyParagraphs[0].textContent = story.paragraph1;
    if (storyParagraphs[1] && story.paragraph2) storyParagraphs[1].textContent = story.paragraph2;
    const storyImage = document.querySelector('#story img');
    if (storyImage && story.image) storyImage.src = story.image;
    if (storyImage && story.imageAlt) storyImage.alt = story.imageAlt;

    const book = record('home-book');
    text('#book .glass span', book.eyebrow);
    text('#book .glass h2', book.heading);
    const bookParagraphs = document.querySelectorAll('#book .glass > p');
    if (bookParagraphs[0] && book.subtitle) bookParagraphs[0].textContent = book.subtitle;
    if (bookParagraphs[1] && book.body) bookParagraphs[1].textContent = book.body;
    text('#bookPreviewButton', book.previewLabel);
    if (book.backgroundImage) document.querySelector('#book').style.backgroundImage = `linear-gradient(90deg,rgba(2,6,23,.96),rgba(2,6,23,.68) 58%,rgba(2,6,23,.12)),url("${book.backgroundImage.replaceAll('"', '%22')}")`;
    if (!document.querySelector('#teachingLibraryButton')) {
      const link = document.createElement('a');
      link.id = 'teachingLibraryButton';
      link.href = '/learn/';
      link.className = 'inline-block ml-0 sm:ml-3 mt-3 sm:mt-0 border border-brand-gold text-brand-gold px-7 py-3.5 rounded-full font-bold hover:bg-brand-gold hover:text-brand-darker transition-colors';
      link.textContent = book.libraryLabel || 'EXPLORE THE TEACHING LIBRARY';
      document.querySelector('#bookPreviewButton')?.insertAdjacentElement('afterend', link);
    }

    const give = record('home-give-one');
    text('#give-one .max-w-3xl span', give.eyebrow);
    text('#give-one .max-w-3xl h2', give.heading);
    text('#give-one .max-w-3xl p', give.body);

    const church = record('home-church');
    text('#church .lg\\:grid-cols-2 > div:first-child > span', church.eyebrow);
    text('#church .lg\\:grid-cols-2 > div:first-child > h2', church.heading);
    const churchParagraph = document.querySelector('#church .lg\\:grid-cols-2 > div:first-child .space-y-5 p:first-child');
    if (churchParagraph && church.body) churchParagraph.textContent = church.body;
    text('#churchForm button[type="submit"]', church.submitLabel);
    if (church.backgroundImage) document.querySelector('#church').style.backgroundImage = `linear-gradient(90deg,rgba(2,6,23,.96),rgba(2,6,23,.72) 55%,rgba(2,6,23,.34)),url("${church.backgroundImage.replaceAll('"', '%22')}")`;

    const announcement = record('site-announcement');
    if (announcement.message) {
      const banner = document.createElement('div');
      banner.className = 'fixed top-0 inset-x-0 z-[90] bg-brand-gold text-brand-darker px-5 py-2.5 text-center text-sm font-bold';
      banner.append(document.createTextNode(announcement.message));
      if (announcement.linkUrl && announcement.linkLabel) {
        const link = document.createElement('a');
        link.className = 'underline ml-2';
        link.href = announcement.linkUrl;
        link.textContent = announcement.linkLabel;
        banner.append(link);
      }
      document.body.prepend(banner);
      document.querySelector('#navbar').style.top = `${banner.offsetHeight}px`;
    }
    if (preview) {
      const badge = document.createElement('div');
      badge.className = 'fixed bottom-5 left-5 z-[100] bg-amber-400 text-slate-950 rounded-full px-4 py-2 text-xs font-extrabold shadow-xl';
      badge.textContent = `CONTENT PREVIEW · REVISION ${data.revision}`;
      document.body.append(badge);
    }
  } catch (error) {
    console.error('structured content', error);
  }
})();
