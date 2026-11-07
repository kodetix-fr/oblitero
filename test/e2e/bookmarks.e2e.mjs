import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName } from '../../vendor/pdf-lib.esm.min.js';
import { writeOutline } from '../../outline.js';
import { launchExtension } from './support/browser.mjs';

let app;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

async function withOutline(name, count, tree) {
  const document = await PDFDocument.create();
  for (let i = 0; i < count; i++) document.addPage([200 + i, 200]);
  writeOutline(document, tree);
  const path = join(app.dir, name);
  writeFileSync(path, await document.save());
  return path;
}

// The outline of the downloaded file, read by PDF.js in the extension: [title, page number, children].
async function outlineOf(page, bytes) {
  return page.evaluate(async (data) => {
    const { openRender, outlineTree } = await import('/render.js');
    const strip = (items) => items.map((item) => [item.title, item.page === null ? null : item.page + 1, strip(item.items)]);
    return strip(await outlineTree(await openRender(new Uint8Array(data))));
  }, [...bytes]);
}

test('the bookmarks of merged files are kept under the name of each file, and left out on request or with a redaction', async () => {
  const item = (title, page, items = []) => ({ title, page, items });
  const report = await withOutline('report.pdf', 3, [item('Intro', 0, [item('Scope', 1)]), item('End', 2)]);
  const annex = await withOutline('annex.pdf', 2, [item('Annex', 1)]);
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', [report, annex]);
  await page.locator('#grid li').nth(4).waitFor();
  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    return readFileSync(await file.path());
  };
  const card = (n) => page.getByRole('button', { name: new RegExp(`^Page ${n}(,|$)`) });

  await card(1).click();
  await page.locator('#hide').click();
  assert.deepEqual(await outlineOf(page, await download()), [
    ['report.pdf', 1, [['Scope', 1, []], ['End', 2, []]]],
    ['annex.pdf', 3, [['Annex', 4, []]]],
  ]);

  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#props-bookmarks').isChecked(), true);
  await page.locator('#props-bookmarks').uncheck();
  await page.locator('#props-apply').click();
  await page.locator('#props-dialog').waitFor({ state: 'hidden' });
  const none = await PDFDocument.load(await download());
  assert.equal(none.catalog.has(PDFName.of('Outlines')), false);
  await page.locator('#undo').click();
  assert.equal((await outlineOf(page, await download())).length, 2);

  await page.locator('#select-none').click();
  await card(2).click();
  await page.locator('#redact').click();
  await page.locator('#redact-dialog').waitFor({ state: 'visible' });
  const bounds = await page.locator('#redact-layer').boundingBox();
  await page.mouse.move(bounds.x + 10, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.locator('#redact-done').click();
  await page.locator('#redact-dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await outlineOf(page, await download()), []);
  await page.close();
});
