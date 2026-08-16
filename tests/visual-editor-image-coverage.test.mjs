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

test('Admin v2 visual editor preserves explicit foreground controls, Media Library selection, and secure live preview', async () => {
  const editor = await readFile(new URL('public/assets/admin-v2/pages/visual-editor.js', root), 'utf8');
  const schemas = await readFile(new URL('netlify/functions/_shared/content-rules.mjs', root), 'utf8');
  const previewLoader = await readFile(new URL('public/assets/site-content-load.js', root), 'utf8');
  const storyRenderer = await readFile(new URL('public/assets/site-content-home-1.js', root), 'utf8');
  const giveRenderer = await readFile(new URL('public/assets/site-content-home-2.js', root), 'utf8');

  assert.match(schemas, /Story image description/);
  assert.match(schemas, /Story image focal point/);
  assert.match(schemas, /Story image fit/);
  assert.match(schemas, /Story image overlay/);
  assert.match(schemas, /Purpose image description/);
  assert.match(schemas, /Purpose image focal point/);
  assert.match(schemas, /Purpose image fit/);
  assert.match(schemas, /Purpose image overlay/);
  assert.match(editor, /mediaPickerButton/);
  assert.match(editor, /data-field-key/);
  assert.match(editor, /baseRevision: state\.libraryRevision, changes/);
  assert.match(editor, /izhe-admin-preview-apply/);
  assert.match(editor, /window\.location\.origin/);
  assert.match(editor, /visualFrame=1/);
  assert.match(previewLoader, /event\.origin!==window\.location\.origin/);
  assert.match(previewLoader, /event\.source!==window\.parent/);
  assert.match(previewLoader, /izhe-admin-preview-apply/);
  assert.match(previewLoader, /izhe-preview-ready/);
  assert.match(storyRenderer, /IZHE_applyForegroundImage/);
  assert.match(giveRenderer, /IZHE_applyForegroundImage/);
});
