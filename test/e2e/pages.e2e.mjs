import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
let page;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

const card = (n) => page.getByRole('button', { name: `Page ${n}`, exact: true });

async function save(download, name) {
  const path = join(app.dir, name);
  await download.saveAs(path);
  return PDFDocument.load(readFileSync(path));
}

test('open a PDF: every page gets a card and a rendered thumbnail', async () => {
  const path = await writePdf(app.dir, 'doc.pdf', [
    { size: 200, text: 'ONE' },
    { size: 300, text: 'TWO' },
    { size: 400, text: 'THREE' },
  ]);
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(2).waitFor();

  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('#grid canvas')).every((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      return data.some((value, i) => i % 4 === 0 && value < 100);
    }),
  );
});

test('select, shift-select, rotate, hide and move', async () => {
  assert.equal(await page.locator('#rotate-right').isDisabled(), true);
  await card(1).click();
  await card(3).click({ modifiers: ['Shift'] });
  assert.equal(await page.locator('#grid [aria-pressed="true"]').count(), 3);

  await page.locator('#select-none').click();
  await card(1).click();
  await page.locator('#hide').click();
  assert.equal(await page.locator('#grid li').count(), 3);
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 1);

  await page.locator('#select-all').click();
  await page.locator('#rotate-right').click();
  await page.locator('#select-none').click();
  await card(2).click();
  await page.locator('#move-later').click();
  assert.equal(await page.locator('#grid li').count(), 3);
});

test('download keeps the edited order and rotation; extract and split work', async () => {
  const [all] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  assert.equal(all.suggestedFilename(), 'doc-edited.pdf');
  const edited = await save(all, 'edited.pdf');
  assert.deepEqual(edited.getPages().map((p) => p.getWidth()), [400, 300]);
  assert.deepEqual(edited.getPages().map((p) => p.getRotation().angle), [90, 90]);

  await page.locator('#select-none').click();
  await card(3).click();
  const [one] = await Promise.all([page.waitForEvent('download'), page.locator('#download-selected').click()]);
  const extracted = await save(one, 'extracted.pdf');
  assert.deepEqual(extracted.getPages().map((p) => p.getWidth()), [300]);

  await page.locator('#cut-every').click();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#download-parts').click()]);
  assert.equal(zip.suggestedFilename(), 'doc-split.zip');
  const archive = readFileSync(await zip.path());
  const entries = [];
  for (let i = archive.indexOf('PK\x03\x04'); i >= 0; i = archive.indexOf('PK\x03\x04', i + 4)) {
    const length = archive.readUInt16LE(i + 26);
    entries.push(archive.toString('utf8', i + 30, i + 30 + length));
  }
  assert.deepEqual(entries, ['doc-001.pdf', 'doc-002.pdf']);
});

test('a file that is not a PDF is refused without changing the document', async () => {
  const path = join(app.dir, 'not.pdf');
  (await import('node:fs')).writeFileSync(path, 'not a pdf');
  await page.setInputFiles('#pages-file', path);
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.includes('Cannot read not.pdf'));
  assert.equal(await page.locator('#grid li').count(), 3);
});

test('adding a second PDF keeps the first and draws its thumbnails', async () => {
  const path = await writePdf(app.dir, 'second.pdf', [
    { size: 200, text: 'A' },
    { size: 200, text: 'B' },
    { size: 200, text: 'C' },
    { size: 200, text: 'D' },
  ]);
  await page.setInputFiles('#pages-file', path);
  await page.waitForFunction(() => document.querySelectorAll('#grid li').length === 7);
  assert.equal(await page.locator('#pages-status').innerText(), '');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('#grid canvas')).every((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      return data.some((value, i) => i % 4 === 0 && value < 100);
    }),
  );
});

test('thumbnails: the ones no page or undo can show again leave the cache', async () => {
  page = await app.openApp();
  const kept = await page.evaluate(async () => {
    const { createThumbs } = await import('./page-thumbs.js');
    const thumbs = createThumbs(() => null);
    const shown = (rotation) => ({ id: 1, file: null, source: 0, blank: { width: 100, height: 100 }, rotation, angle: 0, flip: false, crop: null });
    const turns = [0, 90, 180, 270];
    for (const rotation of turns) thumbs.canvasOf(shown(rotation));
    const before = turns.map((rotation) => !!thumbs.canvasDrawn(shown(rotation)));
    thumbs.keep([shown(90), shown(180)]);
    return { before, after: turns.map((rotation) => !!thumbs.canvasDrawn(shown(rotation))) };
  });
  assert.deepEqual(kept, { before: [true, true, true, true], after: [false, true, true, false] });
  await page.close();
});

test('files view: the first page of each file is drawn through the thumbnail cache', async () => {
  const path = await writePdf(app.dir, 'run.pdf', [{ size: 200, text: 'ONE' }, { size: 300, text: 'TWO' }]);
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(1).waitFor();
  await page.getByRole('radio', { name: 'Files' }).check();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#file-list .file-thumb canvas');
    return canvas && canvas.width !== 300 && canvas.width > 0;
  });
  await page.close();
});
