import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

const hexText = (text) => `FEFF${[...text].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`.toUpperCase();
const hasText = (bytes, text) => bytes.toString('latin1').toUpperCase().includes(hexText(text));

// The box covers the text of page 1: x 0.02-0.62, y 0.04-0.17 of a 400 point page.
const BOX = { x0: 0.02, y0: 0.04, x1: 0.62, y1: 0.17 };

let app;
let page;
let sourcePath;
before(async () => {
  app = await launchExtension();
  sourcePath = await writePdf(
    app.dir,
    'secret.pdf',
    [
      { size: 400, text: 'SECRET-12345' },
      { size: 400, text: 'PUBLIC-67890' },
    ],
    { title: 'SECRET-TITLE' },
  );
  page = await app.openApp();
  await page.setInputFiles('#pages-file', sourcePath);
  await page.locator('#grid li').nth(1).waitFor();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

async function clearSelection() {
  await page.locator('#select-all').click();
  await page.locator('#select-none').click();
}

async function openEditor() {
  await clearSelection();
  await page.getByRole('button', { name: /^Page 1/ }).click();
  await page.locator('#redact').click();
  await page.locator('#redact-dialog').waitFor({ state: 'visible' });
}

async function drawBox() {
  await openEditor();
  const bounds = await page.locator('#redact-layer').boundingBox();
  const at = (fx, fy) => [bounds.x + fx * bounds.width, bounds.y + fy * bounds.height];
  await page.mouse.move(...at(BOX.x0, BOX.y0));
  await page.mouse.down();
  await page.mouse.move(...at((BOX.x0 + BOX.x1) / 2, BOX.y1), { steps: 4 });
  await page.mouse.move(...at(BOX.x1, BOX.y1), { steps: 4 });
  await page.mouse.up();
}

// Opens the downloaded bytes with pdf.js in the app page: the text of page 1 and the luminance at two points of it.
function inspect(bytes, points) {
  return page.evaluate(
    async ({ bytes, points }) => {
      const { openRender, renderPage } = await import('./render.js');
      const doc = await openRender(new Uint8Array(bytes));
      const text = async (index) => (await (await doc.getPage(index)).getTextContent()).items.map((item) => item.str).join(' ');
      const canvas = document.createElement('canvas');
      await renderPage(doc, 0, 0, canvas, 1);
      const context = canvas.getContext('2d');
      const luminance = points.map(([fx, fy]) => {
        const [r, g, b] = context.getImageData(Math.round(fx * canvas.width), Math.round(fy * canvas.height), 1, 1).data;
        return (r + g + b) / 3;
      });
      const { info } = await doc.getMetadata();
      return { pages: doc.numPages, first: await text(1), second: await text(2), title: info.Title ?? '', luminance };
    },
    { bytes: Array.from(bytes), points },
  );
}

async function downloadAll(name) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const path = join(app.dir, name);
  await download.saveAs(path);
  return readFileSync(path);
}

test('the redacted page loses its content and metadata; the other page keeps its text', async () => {
  await drawBox();
  await page.locator('#redact-done').click();
  await page.locator('#grid .box').waitFor();
  assert.equal(await page.locator('#grid .box').count(), 1);

  assert.ok(hasText(readFileSync(sourcePath), 'SECRET-TITLE'), 'the source has no title to lose');
  const bytes = await downloadAll('redacted.pdf');

  const centre = [(BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2];
  const result = await inspect(bytes, [centre, [0.5, 0.6]]);
  assert.equal(result.pages, 2);
  assert.equal(result.title, '', 'the title of the source is still in the file');
  assert.equal(result.first, '', 'page 1 still has selectable text');
  assert.match(result.second, /PUBLIC-67890/);
  assert.ok(result.luminance[0] < 30, `the box is not black (${result.luminance[0]})`);
  assert.ok(result.luminance[1] > 225, `the rest of the page is not white (${result.luminance[1]})`);
});

test('rotating a page turns its redactions with it', async () => {
  await clearSelection();
  await page.getByRole('button', { name: /^Page 1/ }).click();
  await page.locator('#rotate-right').click();

  const bytes = await downloadAll('rotated.pdf');
  const turned = [1 - (BOX.y0 + BOX.y1) / 2, (BOX.x0 + BOX.x1) / 2];
  const result = await inspect(bytes, [turned, [(BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2]]);
  assert.ok(result.luminance[0] < 30, `the turned box is not black (${result.luminance[0]})`);
  assert.ok(result.luminance[1] > 225, `the old place of the box is not white (${result.luminance[1]})`);
});

test('cancelling the editor keeps the previous redactions', async () => {
  await openEditor();
  await page.locator('#redact-clear').click();
  await page.locator('#redact-cancel').click();
  assert.equal(await page.locator('#grid .box').count(), 1);
});

test('a rectangle can be placed, moved, resized and removed with the keyboard alone', async () => {
  await openEditor();
  const layer = page.locator('#redact-layer');
  await page.locator('#redact-clear').click();
  await layer.focus();
  const rectangles = () => layer.locator('.box:not(.draft)');

  await page.keyboard.press('Enter');
  assert.match(await page.locator('#redact-live').innerText(), /Rectangle started/);
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
  assert.equal(await layer.locator('.box.draft').count(), 1);
  await page.keyboard.press('Enter');
  assert.equal(await rectangles().count(), 1);
  assert.match(await page.locator('#redact-live').innerText(), /Rectangle 1 added/);
  assert.equal(await page.locator('#redact-count').innerText(), '1 rectangle');

  const before = await rectangles().first().boundingBox();
  assert.equal(await rectangles().first().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const after = await rectangles().first().boundingBox();
  assert.ok(after.x > before.x, 'it moved');
  assert.ok(after.width > before.width, 'it grew');

  await page.keyboard.press('Delete');
  assert.equal(await rectangles().count(), 0);
  assert.match(await page.locator('#redact-live').innerText(), /Rectangle removed/);

  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#redact-dialog').isVisible(), true, 'Escape cancels the rectangle, not the dialog');
  assert.equal(await layer.locator('.box.draft').count(), 0);

  await page.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  await page.locator('#redact-done').click();
  await page.locator('#grid .badge').first().waitFor();
  assert.equal(await page.locator('#grid .badge').first().innerText(), '1 redacted');
});

test('a file whose pages the two readers count differently is rebuilt from the pages both can read', async () => {
  const source = await PDFDocument.load(readFileSync(await writePdf(app.dir, 'typeless-source.pdf', [{ size: 300, text: 'COVER' }, { size: 300, text: 'INSIDE' }, { size: 300, text: 'LAST' }])));
  source.getPage(0).node.delete(PDFName.of('Type'));
  const path = join(app.dir, 'typeless.pdf');
  writeFileSync(path, await source.save({ useObjectStreams: false }));
  const tab = await app.openApp();
  await tab.setInputFiles('#pages-file', path);
  await tab.waitForFunction(() => /typeless\.pdf/.test(document.getElementById('pages-status').textContent));
  assert.equal(await tab.locator('#grid li').count(), 2);
  assert.equal(await tab.locator('#pages-status').innerText(), 'typeless.pdf was damaged and has been repaired: 2 pages recovered out of 3 pages.');
  await tab.close();
});
