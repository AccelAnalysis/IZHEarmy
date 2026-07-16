import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContentRecord } from '../netlify/functions/_shared/content-rules.mjs';

const root = new URL('../', import.meta.url);

test('foreground image presentation settings are validated for Story and Give One', () => {
  const story = validateContentRecord({
    key: 'home-story',
    status: 'published',
    fields: {
      heading: 'More than a logo.',
      image: '/assets/media/izhe/izhe-model-woman-white-logo-tee-front.webp',
      imageAlt: 'Woman wearing an IZHE shirt',
      imageFocalPoint: 'top',
      imageFit: 'cover',
      imageOverlay: 'light'
    }
  });
  assert.equal(story.fields.imageFocalPoint, 'top');
  assert.equal(story.fields.imageFit, 'cover');
  assert.equal(story.fields.imageOverlay, 'light');

  const giveOne = validateContentRecord({
    key: 'home-give-one',
    status: 'published',
    fields: {
      heading: 'Give One',
      image: '/assets/media/izhe/izhe-community-group-blue-shirt-screenshot.webp',
      imageAlt: 'IZHE community gathering',
      imageFocalPoint: 'center',
      imageFit: 'contain',
      imageOverlay: 'strong'
    }
  });
  assert.equal(giveOne.fields.imageFit, 'contain');
  assert.throws(() => validateContentRecord({
    key: 'home-story',
    status: 'published',
    fields: { heading: 'Story', imageFocalPoint: 'unsafe-pixel-position', imageFit: 'cover', imageOverlay: 'medium' }
  }), /valid story image focal point/i);
});

test('visual editor exposes explicit controls for every non-product foreground image', async () => {
  const frame = await readFile(new URL('public/assets/visual-editor-frame.js', root), 'utf8');
  const editor = await readFile(new URL('public/assets/visual-editor-part-2.js', root), 'utf8');
  const storyRenderer = await readFile(new URL('public/assets/site-content-home-1.js', root), 'utf8');
  const giveRenderer = await readFile(new URL('public/assets/site-content-home-2.js', root), 'utf8');

  assert.match(frame, /Story image/);
  assert.match(frame, /Give One purpose image/);
  assert.match(frame, /CHANGE IMAGE/);
  assert.match(frame, /veAltField/);
  assert.match(frame, /veFocalField/);
  assert.match(frame, /veFitField/);
  assert.match(frame, /veOverlayField/);
  assert.match(editor, /ACCESSIBLE IMAGE DESCRIPTION/);
  assert.match(editor, /IMAGE FOCAL POINT/);
  assert.match(editor, /IMAGE FIT/);
  assert.match(editor, /TEXT OVERLAY/);
  assert.match(editor, /data-media-alt/);
  assert.match(storyRenderer, /IZHE_applyForegroundImage/);
  assert.match(giveRenderer, /IZHE_applyForegroundImage/);
});
