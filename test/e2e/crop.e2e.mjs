import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

// The text of each page of `bytes`, read by PDF.js in the extension.
async function texts(page, bytes) {
  return page.evaluate(async (data) => {
    const { openRender } = await import('/render.js');
    const doc = await openRender(new Uint8Array(data));
    const found = [];
    for (let index = 1; index <= doc.numPages; index++) found.push((await (await doc.getPage(index)).getTextContent()).items.map((item) => item.str).join(' '));
    return found;
  }, [...bytes]);
}

test('a crop keeps the framed part of the selected pages, removes the rest on request, and the paper setting puts pages on A4', async () => {
  const path = await writePdf(app.dir, 'crop.pdf', [{ size: 400, text: 'top left words' }, { size: 400, text: 'other' }]);
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(1).waitFor();
  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    return readFileSync(await file.path());
  };
  const card = (n) => page.getByRole('button', { name: new RegExp(`^Page ${n}(,|$)`) });

  // The left half of the first page.
  const frame = async (remove) => {
    await page.locator('#crop').click();
    await page.locator('#redact-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#redact-dialog').getAttribute('data-mode'), 'crop');
    assert.match(await page.locator('#redact-hint').innerText(), /hidden, not removed/);
    assert.equal(await page.locator('#crop-remove').isChecked(), false);
    const bounds = await page.locator('#redact-layer').boundingBox();
    await page.mouse.move(bounds.x + 1, bounds.y + 1);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 1, { steps: 4 });
    await page.mouse.up();
    await page.locator('#crop-remove').setChecked(remove);
    await page.locator('#redact-done').click();
    await page.locator('#redact-dialog').waitFor({ state: 'hidden' });
  };

  await card(1).click();
  await frame(false);
  const kept = await download();
  const sizes = (await PDFDocument.load(kept)).getPages().map((p) => [Math.round(p.getWidth() / 10), Math.round(p.getHeight() / 10)]);
  assert.deepEqual(sizes, [
    [20, 40],
    [40, 40],
  ]);
  assert.match((await texts(page, kept))[0], /top left/);

  await frame(true);
  const removed = await download();
  assert.equal((await texts(page, removed))[0], '');
  assert.equal(Math.round((await PDFDocument.load(removed)).getPage(0).getWidth() / 10), 20);

  await page.locator('#paper-size').selectOption('a4');
  const sheets = (await PDFDocument.load(await download())).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  assert.deepEqual(sheets, [
    [595, 842],
    [595, 842],
  ]);
  await page.close();
});
