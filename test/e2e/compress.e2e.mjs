import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension } from './support/browser.mjs';

let app;
let page;
let source;
before(async () => {
  app = await launchExtension();
  page = await app.openApp();
  // A photo-like picture: noise that a JPEG cannot squeeze much, drawn by the browser, in a PDF that also has text.
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    const image = context.createImageData(1600, 1200);
    let seed = 1;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      image.data[i] = (seed >>> 8) & 255;
      image.data[i + 1] = (seed >>> 16) & 255;
      image.data[i + 2] = (seed >>> 4) & 255;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const picture = await document.embedJpg(new Uint8Array(jpeg));
  const sheet = document.addPage([612, 792]);
  sheet.drawImage(picture, { x: 56, y: 300, width: 500, height: 375 });
  sheet.drawText('KEEP-THIS-TEXT', { x: 56, y: 740, size: 20, font });
  source = join(app.dir, 'photos.pdf');
  writeFileSync(source, await document.save({ useObjectStreams: false }));
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

const resultText = () => page.locator('#compress-result').innerText();

async function waitForSaving() {
  await page.waitForFunction(() => /smaller|No saving/.test(document.getElementById('compress-result').textContent), null, { timeout: 60000 });
}

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { bytes: readFileSync(await download.path()), name: download.suggestedFilename() };
}

test('a PDF full of photos gets smaller at each level, and still holds its text and its picture', async () => {
  await page.getByRole('tab', { name: 'Compress' }).click();
  await page.setInputFiles('#compress-file', source);
  await page.locator('#compress-name').waitFor();
  assert.equal(await page.locator('#compress-name').innerText(), 'photos.pdf');
  const original = readFileSync(source).length;

  const sizes = {};
  for (const level of ['Light', 'Balanced', 'Strong']) {
    await page.getByRole('radio', { name: level }).check();
    await waitForSaving();
    if (level !== 'Light') {
      const { bytes, name } = await downloaded(() => page.locator('#compress-download').click());
      assert.equal(name, 'photos-compressed.pdf');
      sizes[level] = bytes.length;
      const checked = await page.evaluate(async (bytes) => {
        const { openRender, renderPage } = await import('./render.js');
        const doc = await openRender(new Uint8Array(bytes));
        const sheet = await doc.getPage(1);
        const text = (await sheet.getTextContent()).items.map((item) => item.str).join(' ');
        const canvas = document.createElement('canvas');
        await renderPage(doc, 0, 0, canvas, 0.5);
        const { data } = canvas.getContext('2d').getImageData(canvas.width >> 1, Math.round(canvas.height * 0.45), 1, 1);
        return { pages: doc.numPages, text, ink: data[0] + data[1] + data[2] };
      }, Array.from(bytes));
      assert.equal(checked.pages, 1);
      assert.match(checked.text, /KEEP-THIS-TEXT/);
      assert.ok(checked.ink > 60 && checked.ink < 740, `the picture is gone or blank: ${checked.ink}`);
    }
  }
  assert.ok(sizes.Balanced < original * 0.75, `${sizes.Balanced} against ${original}`);
  assert.ok(sizes.Strong < sizes.Balanced * 0.8, `${sizes.Strong} against ${sizes.Balanced}`);
});

test('the result says the size before and after, and a file that is not a PDF is refused', async () => {
  await page.getByRole('radio', { name: 'Balanced' }).check();
  await waitForSaving();
  assert.match((await resultText()).replace(/\s+/g, ' '), /^[\d.]+ [KM]B to [\d.]+ [KM]B, \d+ % smaller\.$/);
  assert.equal(await page.locator('#compress-download').isDisabled(), false);

  const text = join(app.dir, 'fake.pdf');
  writeFileSync(text, 'not a pdf at all');
  await page.setInputFiles('#compress-file', text);
  await page.waitForFunction(() => document.getElementById('compress-note').textContent.includes('Cannot read fake.pdf'));
  assert.equal(await page.locator('#compress-name').innerText(), 'photos.pdf');
});
