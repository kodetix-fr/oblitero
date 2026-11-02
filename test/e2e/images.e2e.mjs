import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';
import { readZip } from './support/zip.mjs';

let app;
let page;
before(async () => {
  app = await launchExtension();
  page = await app.openApp();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

// A picture of one color, made by the browser itself (PNG, JPEG or WebP).
async function picture(name, type, width, height, color) {
  const bytes = await page.evaluate(
    async ({ type, width, height, color }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { type, width, height, color },
  );
  const path = join(app.dir, name);
  writeFileSync(path, Buffer.from(bytes));
  return path;
}

// The same JPEG with an EXIF block that says "rotate a quarter turn".
function withOrientation(path, orientation) {
  const jpeg = readFileSync(path);
  const tiff = Buffer.alloc(24);
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(body.length + 2);
  const out = join(app.dir, `sideways-${orientation}.jpg`);
  writeFileSync(out, Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, body, jpeg.subarray(2)]));
  return out;
}

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { bytes: readFileSync(await download.path()), name: download.suggestedFilename() };
}

test('photos become the pages of a PDF, in the order of the list, whatever their format', async () => {
  const red = await picture('red.png', 'image/png', 400, 200, '#ff0000');
  const green = await picture('green.jpg', 'image/jpeg', 100, 300, '#00ff00');
  const blue = await picture('blue.webp', 'image/webp', 200, 200, '#0000ff');
  await page.setInputFiles('#pages-file', [red, green, blue]);
  await page.locator('#grid li').nth(2).waitFor();
  assert.equal(await page.locator('#photo-settings').isVisible(), true);
  await page.getByRole('radio', { name: 'Files' }).check();
  assert.deepEqual(await page.locator('#file-list .pages').allInnerTexts(), ['1 page, photo', '1 page, photo', '1 page, photo']);

  await page.getByRole('button', { name: 'red.png: Down' }).click();
  await page.getByRole('button', { name: 'red.png: Down' }).click();
  assert.deepEqual(await page.locator('#file-list .name').allInnerTexts(), ['green.jpg', 'blue.webp', 'red.png']);

  const { bytes, name } = await downloaded(() => page.locator('#download-all').click());
  assert.equal(name, 'green-edited.pdf');
  const output = await PDFDocument.load(bytes);
  assert.deepEqual(output.getPages().map((p) => [p.getWidth(), p.getHeight()]), [[75, 225], [150, 150], [300, 150]]);

  const centres = await page.evaluate(async (bytes) => {
    const { openRender, renderPage } = await import('./render.js');
    const doc = await openRender(new Uint8Array(bytes));
    const out = [];
    for (let i = 0; i < doc.numPages; i++) {
      const canvas = document.createElement('canvas');
      await renderPage(doc, i, 0, canvas, 1);
      out.push(Array.from(canvas.getContext('2d').getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data.slice(0, 3)));
    }
    return out;
  }, Array.from(bytes));
  const [[r1, g1, b1], [r2, g2, b2], [r3, g3, b3]] = centres;
  assert.ok(g1 > 200 && r1 < 60 && b1 < 60, `green: ${centres[0]}`);
  assert.ok(b2 > 200 && r2 < 60 && g2 < 60, `blue: ${centres[1]}`);
  assert.ok(r3 > 200 && g3 < 60 && b3 < 60, `red: ${centres[2]}`);
});

test('page size and margin change the photo pages, and a photo stored sideways is turned upright', async () => {
  await page.getByRole('radio', { name: 'Pages' }).check();
  await page.locator('#clear-all').click();
  const flat = await picture('flat.jpg', 'image/jpeg', 200, 100, '#888888');
  await page.setInputFiles('#pages-file', [withOrientation(flat, 6)]);
  await page.locator('#grid li').first().waitFor();

  const fit = await PDFDocument.load((await downloaded(() => page.locator('#download-all').click())).bytes);
  assert.deepEqual([fit.getPage(0).getWidth(), fit.getPage(0).getHeight()], [75, 150]);

  await page.locator('#images-size').selectOption('a4');
  await page.locator('#images-margin').selectOption('large');
  await page.waitForFunction(() => !document.getElementById('pages-status').textContent);
  const a4 = await PDFDocument.load((await downloaded(() => page.locator('#download-all').click())).bytes);
  assert.deepEqual([a4.getPage(0).getWidth(), a4.getPage(0).getHeight()], [595.28, 841.89]);
});

test('the page of the photos stays as it is while a photo carries a text or a signature', async () => {
  await page.locator('#add-text').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  await page.locator('#place-text').fill('NOTE');
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });
  await page.locator('#grid .mark-text').waitFor();
  await page.locator('#images-size').selectOption('letter');
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.includes('Remove the redactions'));
  assert.equal(await page.locator('#images-size').inputValue(), 'a4');
  await page.locator('#clear-marks').click();
  await page.locator('#images-size').selectOption('letter');
  await page.waitForFunction(() => !document.getElementById('pages-status').textContent);
  const letter = await PDFDocument.load((await downloaded(() => page.locator('#download-all').click())).bytes);
  assert.deepEqual([letter.getPage(0).getWidth(), letter.getPage(0).getHeight()], [612, 792]);
});

test('a file that is not an image or a PDF is refused and the others stay', async () => {
  const text = join(app.dir, 'note.png');
  writeFileSync(text, 'not an image');
  await page.setInputFiles('#pages-file', [text]);
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.includes('Cannot read note.png'));
  assert.equal(await page.locator('#grid li').count(), 1);
});

test('the pages of a PDF can be saved as images: a ZIP of the shown pages, or the one image when one is selected', async () => {
  const path = await writePdf(app.dir, 'for-images.pdf', [{ size: 200, text: 'A' }, { size: 300, text: 'B' }, { size: 400, text: 'C' }]);
  await page.locator('#clear-all').click();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(2).waitFor();
  await page.getByRole('button', { name: /^Page 2$/ }).click();
  await page.locator('#hide').click();
  await page.locator('#select-none').click();

  await page.locator('#export-images').click();
  assert.match(await page.locator('#export-note').innerText(), /2 pages will be saved in a ZIP/);
  await page.locator('#export-format').selectOption('image/png');
  await page.locator('#export-dpi').selectOption('72');
  const zip = await downloaded(() => page.locator('#export-go').click());
  assert.equal(zip.name, 'for-images-images.zip');
  const entries = readZip(zip.bytes);
  assert.deepEqual(entries.map((entry) => entry.name), ['for-images-page-001.png', 'for-images-page-003.png']);
  assert.deepEqual(entries.map((entry) => entry.data.readUInt32BE(16)), [200, 400]);

  await page.getByRole('button', { name: /^Page 3$/ }).click();
  await page.locator('#export-images').click();
  await page.locator('#export-format').selectOption('image/jpeg');
  await page.locator('#export-dpi').selectOption('150');
  const single = await downloaded(() => page.locator('#export-go').click());
  assert.equal(single.name, 'for-images-page-003.jpg');
  assert.deepEqual([...single.bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});
