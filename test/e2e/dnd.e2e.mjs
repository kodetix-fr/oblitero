import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// A drag of files from outside the page, as the browser sends it.
function dragFiles(page, type, files) {
  return page.evaluate(
    ({ type, files }) => {
      const transfer = new DataTransfer();
      for (const { name, bytes } of files) transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    },
    { type, files: files.map(({ name, path }) => ({ name, bytes: Array.from(readFileSync(path)) })) },
  );
}

test('files dragged over the page show a box that says what a drop does, and a drop adds them', async () => {
  const one = { name: 'one.pdf', path: await writePdf(app.dir, 'one.pdf', [{ size: 100, text: 'A' }]) };
  const two = { name: 'two.pdf', path: await writePdf(app.dir, 'two.pdf', [{ size: 200, text: 'B' }, { size: 200, text: 'C' }]) };
  const page = await app.openApp();

  assert.equal(await page.locator('#dropHint').isHidden(), true);
  await dragFiles(page, 'dragover', [one]);
  assert.equal(await page.locator('#dropHint').isVisible(), true);
  assert.equal(await page.locator('#dropHint p').innerText(), 'Drop PDF files or photos to start');
  await page.evaluate(() => dispatchEvent(new DragEvent('dragleave', { bubbles: true })));
  assert.equal(await page.locator('#dropHint').isHidden(), true);

  await dragFiles(page, 'dragover', [one, two]);
  await dragFiles(page, 'drop', [one, two]);
  await page.locator('#grid li').nth(2).waitFor();
  assert.equal(await page.locator('#dropHint').isHidden(), true);
  assert.equal(await page.locator('#pages-name').innerText(), 'one.pdf and 1 more');

  await dragFiles(page, 'dragover', [two]);
  assert.equal(await page.locator('#dropHint p').innerText(), 'Drop PDF files or photos to add them');
  await dragFiles(page, 'drop', [two]);
  await page.locator('#grid li').nth(4).waitFor();
  assert.equal(await page.locator('#grid li').count(), 5);
  await page.close();
});

test('a card dragged inside the page does not raise the file box', async () => {
  const page = await app.openApp();
  const path = await writePdf(app.dir, 'inner.pdf', [{ size: 100 }, { size: 100 }]);
  await page.setInputFiles('#pages-file', [path, path]);
  await page.getByRole('radio', { name: 'Files' }).check();
  await page.locator('#file-list li').nth(1).waitFor();
  // The hint was shown at some point of the drag when it is shown now, or when a change of its `hidden` found it shown before.
  await page.evaluate(() => {
    const hint = document.getElementById('dropHint');
    window.hintShown = false;
    new MutationObserver((records) => {
      if (!hint.hidden || records.some((record) => record.oldValue === null)) window.hintShown = true;
    }).observe(hint, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  });
  await page.locator('#file-list li').nth(0).dragTo(page.locator('#file-list li').nth(1));
  assert.equal(await page.evaluate(() => window.hintShown), false);
  await page.close();
});

test('files: a file dragged by its card moves above or below the one it is dropped on', async () => {
  const names = ['a.pdf', 'b.pdf', 'c.pdf'];
  const paths = [];
  for (const [i, name] of names.entries()) paths.push(await writePdf(app.dir, name, [{ size: 100 + 50 * i, text: name[0] }]));
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', paths);
  await page.getByRole('radio', { name: 'Files' }).check();
  await page.locator('#file-list li').nth(2).waitFor();
  const order = () => page.locator('#file-list .name').allInnerTexts();

  await page.locator('#file-list li').nth(2).dragTo(page.locator('#file-list li').nth(0), { targetPosition: { x: 200, y: 4 } });
  assert.deepEqual(await order(), ['c.pdf', 'a.pdf', 'b.pdf']);
  await page.locator('#file-list li').nth(0).dragTo(page.locator('#file-list li').nth(2), { targetPosition: { x: 200, y: 40 } });
  assert.deepEqual(await order(), ['a.pdf', 'b.pdf', 'c.pdf']);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const saved = join(app.dir, 'dnd-merged.pdf');
  await download.saveAs(saved);
  assert.deepEqual((await PDFDocument.load(readFileSync(saved))).getPages().map((p) => p.getWidth()), [100, 150, 200]);
  await page.close();
});

test('pages: a card dragged to a new place carries the whole selection with it', async () => {
  const path = await writePdf(app.dir, 'four.pdf', [100, 200, 300, 400].map((size) => ({ size, text: String(size) })));
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(3).waitFor();
  const widths = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    const saved = join(app.dir, `order-${Date.now()}.pdf`);
    await download.saveAs(saved);
    return (await PDFDocument.load(readFileSync(saved))).getPages().map((p) => p.getWidth());
  };

  await page.locator('#grid li').nth(3).dragTo(page.locator('#grid li').nth(0), { targetPosition: { x: 8, y: 60 } });
  assert.deepEqual(await widths(), [400, 100, 200, 300]);

  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await page.locator('#grid li').nth(1).dragTo(page.locator('#grid li').nth(3), { targetPosition: { x: 170, y: 60 } });
  assert.deepEqual(await widths(), [400, 300, 100, 200]);
  await page.close();
});
