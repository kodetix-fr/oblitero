import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchExtension, writePdf } from './support/browser.mjs';
import { readZip } from './support/zip.mjs';

let app;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

// The text of each page of each PDF, read by PDF.js in the extension.
async function textsOf(page, files) {
  return page.evaluate(async (all) => {
    const { openRender } = await import('/render.js');
    const texts = [];
    for (const data of all) {
      const doc = await openRender(new Uint8Array(data));
      for (let index = 1; index <= doc.numPages; index++) texts.push((await (await doc.getPage(index)).getTextContent()).items.map((item) => item.str).join(' '));
    }
    return texts;
  }, files.map((file) => [...file]));
}

test('Bates numbers go on across the parts of the ZIP, and a stamp is drawn on the pages of the range', async () => {
  const sizes = [300, 300, 300, 300, 300];
  const path = await writePdf(app.dir, 'case.pdf', sizes.map((size) => ({ size, text: '' })));
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(4).waitFor();
  await page.locator('#split-size').fill('2');
  await page.locator('#cut-every').click();

  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#bates-on').check();
  await page.locator('#bates-prefix').fill('CASE-');
  await page.locator('#bates-digits').fill('4');
  await page.locator('#mark-on').check();
  await page.locator('#mark-text').fill('RECEIVED');
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('selection-summary').textContent.includes('Bates'));

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-parts').click()]);
  const files = readZip(readFileSync(await download.path())).map(({ data }) => data);
  assert.equal(files.length, 3);
  const texts = await textsOf(page, files);
  assert.deepEqual(texts.map((text) => /CASE-\d{4}/.exec(text)?.[0]), ['CASE-0001', 'CASE-0002', 'CASE-0003', 'CASE-0004', 'CASE-0005']);
  assert.ok(texts.every((text) => text.includes('RECEIVED')));
  await page.close();
});

test('the preview of the stamps puts them where the download does, on the paper size that is chosen', async () => {
  const path = await writePdf(app.dir, 'letter.pdf', [{ size: 300, text: '' }]);
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').first().waitFor();
  await page.locator('#paper-size').selectOption('a4');
  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#numbers-on').check();
  await page.locator('#numbers-position').selectOption('bottom-right');

  // The share of the page, from its top left corner, that holds the ink.
  await page.evaluate(() => {
    window.inkOf = (canvas) => {
      const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let box = null;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const at = (y * width + x) * 4;
          if (data[at] + data[at + 1] + data[at + 2] > 300) continue;
          box = box ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x + 1), bottom: Math.max(box.bottom, y + 1) } : { left: x, top: y, right: x + 1, bottom: y + 1 };
        }
      }
      return box && { left: box.left / width, top: box.top / height, right: box.right / width, bottom: box.bottom / height };
    };
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#stamp-canvas canvas');
    return !!canvas && !!window.inkOf(canvas);
  });
  const shown = await page.evaluate(() => window.inkOf(document.querySelector('#stamp-canvas canvas')));
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const bytes = [...readFileSync(await download.path())];
  const saved = await page.evaluate(async (data) => {
    const { openRender, renderPage } = await import('/render.js');
    const canvas = document.createElement('canvas');
    await renderPage(await openRender(new Uint8Array(data)), 0, 0, canvas, 1);
    return window.inkOf(canvas);
  }, bytes);
  for (const edge of ['left', 'top', 'right', 'bottom']) assert.ok(Math.abs(shown[edge] - saved[edge]) < 0.01, `${edge}: ${shown[edge]} in the preview, ${saved[edge]} in the download`);
  await page.close();
});
