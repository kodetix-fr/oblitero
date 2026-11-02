import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

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

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { bytes: readFileSync(await download.path()), name: download.suggestedFilename() };
}

const settled = () => page.waitForFunction(() => !/^(Preparing|Compressing)/.test(document.getElementById('pages-status').textContent), null, { timeout: 60000 });

test('a PDF full of photos gets smaller at each level, and still holds its text and its picture', async () => {
  await page.setInputFiles('#pages-file', source);
  await page.locator('#grid li').first().waitFor();
  assert.equal(await page.locator('#compare-open').isHidden(), true);
  const original = readFileSync(source).length;

  const sizes = {};
  for (const level of ['Light', 'Balanced', 'Strong']) {
    await page.getByRole('radio', { name: level }).check();
    const { bytes, name } = await downloaded(() => page.locator('#download-all').click());
    assert.equal(name, 'photos-edited.pdf');
    sizes[level] = bytes.length;
    if (level === 'Light') continue;
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
  assert.ok(sizes.Balanced < original * 0.75, `${sizes.Balanced} against ${original}`);
  assert.ok(sizes.Strong < sizes.Balanced * 0.8, `${sizes.Strong} against ${sizes.Balanced}`);
});

test('the status says the size before and after, and a file that is not a PDF is refused', async () => {
  await page.getByRole('radio', { name: 'Balanced' }).check();
  await downloaded(() => page.locator('#download-all').click());
  await page.waitForFunction(() => /^Compressed from/.test(document.getElementById('pages-status').textContent));
  assert.match(await page.locator('#pages-status').innerText(), /^Compressed from [\d.]+ [KM]B to [\d.]+ [KM]B\.$/);

  await page.getByRole('radio', { name: 'None' }).check();
  await downloaded(() => page.locator('#download-all').click());
  await page.waitForFunction(() => document.getElementById('pages-status').textContent === '');

  const text = join(app.dir, 'fake.pdf');
  writeFileSync(text, 'not a pdf at all');
  await page.setInputFiles('#pages-file', text);
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.includes('Cannot read fake.pdf'));
  assert.equal(await page.locator('#grid li').count(), 1);
});

test('the same page is shown before and after, with a line to compare them', async () => {
  await page.getByRole('radio', { name: 'Strong' }).check();
  await page.locator('#compare-open').click();
  await page.locator('#compare-pages canvas').nth(1).waitFor();
  assert.equal(await page.locator('#compare-page').innerText(), 'Page 1 of 1');
  assert.equal(await page.locator('#compare-prev').isDisabled(), true);
  assert.equal(await page.locator('#compare-next').isDisabled(), true);
  assert.match(await page.locator('#compare-before-size').innerText(), /^[\d.]+ [KM]B$/);
  assert.match(await page.locator('#compare-after-size').innerText(), /^[\d.]+ [KM]B$/);

  const difference = await page.evaluate(() => {
    const [before, after] = document.querySelectorAll('#compare-pages canvas');
    const read = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const [a, b] = [read(before), read(after)];
    let total = 0;
    for (let i = 0; i < a.length; i += 4) total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return { same: before.width === after.width && before.height === after.height, mean: total / (a.length / 4) };
  });
  assert.ok(difference.same, 'both sides have the same size');
  assert.ok(difference.mean > 3, `the two sides look alike: ${difference.mean}`);

  const handle = page.locator('#compare-handle');
  const value = async () => Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await value(), 55);
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await value(), 35);
  await page.keyboard.press('Home');
  assert.equal(await value(), 0);
  await page.keyboard.press('End');
  assert.equal(await value(), 100);

  const box = await page.locator('#compare-stage').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + 60, { steps: 4 });
  await page.mouse.up();
  assert.ok(Math.abs((await value()) - 25) <= 1, `the line is at ${await value()} %`);
  assert.equal(await page.locator('#compare-stage').evaluate((element) => element.style.getPropertyValue('--split')), `${await value()}%`);
  await page.locator('#compare-close').click();
  await page.locator('#compare-dialog').waitFor({ state: 'hidden' });
  await settled();
});

test('the pages of a longer result can be turned, and the comparison starts again at the first page', async () => {
  const album = await writePdf(app.dir, 'album.pdf', [1, 2, 3].map((n) => ({ size: 300, text: `PAGE-${n}` })));
  await page.setInputFiles('#pages-file', album);
  await page.locator('#grid li').nth(3).waitFor();
  await page.locator('#compare-open').click();
  await page.waitForFunction(() => document.getElementById('compare-page').textContent === 'Page 1 of 4');
  await page.locator('#compare-next').click();
  await page.waitForFunction(() => document.getElementById('compare-page').textContent === 'Page 2 of 4');
  await page.locator('#compare-next').click();
  await page.locator('#compare-next').click();
  await page.waitForFunction(() => document.getElementById('compare-page').textContent === 'Page 4 of 4');
  assert.equal(await page.locator('#compare-next').isDisabled(), true);
  await page.locator('#compare-close').click();
  await page.locator('#compare-dialog').waitFor({ state: 'hidden' });
  await settled();
  await page.locator('#compare-open').click();
  await page.waitForFunction(() => document.getElementById('compare-page').textContent === 'Page 1 of 4');
  await page.locator('#compare-close').click();
});
