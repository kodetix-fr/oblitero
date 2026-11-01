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

test('files dragged over the page show a box that names the tool, and a drop adds them', async () => {
  const one = { name: 'one.pdf', path: await writePdf(app.dir, 'one.pdf', [{ size: 100, text: 'A' }]) };
  const two = { name: 'two.pdf', path: await writePdf(app.dir, 'two.pdf', [{ size: 200, text: 'B' }, { size: 200, text: 'C' }]) };
  const page = await app.openApp();

  assert.equal(await page.locator('#dropHint').isHidden(), true);
  await dragFiles(page, 'dragover', [one]);
  assert.equal(await page.locator('#dropHint').isVisible(), true);
  assert.equal(await page.locator('#dropHint p').innerText(), 'Drop PDF files to add them');
  await page.evaluate(() => dispatchEvent(new DragEvent('dragleave', { bubbles: true })));
  assert.equal(await page.locator('#dropHint').isHidden(), true);

  await dragFiles(page, 'dragover', [one, two]);
  await dragFiles(page, 'drop', [one, two]);
  await page.locator('#list li').nth(1).waitFor();
  assert.deepEqual(await page.locator('#list .name').allInnerTexts(), ['one.pdf', 'two.pdf']);
  assert.equal(await page.locator('#dropHint').isHidden(), true);
  assert.equal(await page.locator('#merge-summary').innerText(), '2 files, 3 pages');

  await page.getByRole('tab', { name: 'Pages' }).click();
  await dragFiles(page, 'dragover', [two]);
  assert.equal(await page.locator('#dropHint p').innerText(), 'Drop a PDF to open it');
  await dragFiles(page, 'drop', [two]);
  await page.locator('#grid li').nth(1).waitFor();
  assert.equal(await page.locator('#pages-name').innerText(), 'two.pdf');
  assert.equal(await page.locator('#grid li').count(), 2);
  await page.close();
});

test('a card dragged inside the page does not raise the file box', async () => {
  const page = await app.openApp();
  const path = await writePdf(app.dir, 'inner.pdf', [{ size: 100 }, { size: 100 }]);
  await page.setInputFiles('#files', [path, path]);
  await page.locator('#list li').nth(1).waitFor();
  const [box] = await Promise.all([
    page.evaluate(() => new Promise((resolve) => setTimeout(() => resolve(!document.getElementById('dropHint').hidden), 600))),
    page.locator('#list li').nth(0).dragTo(page.locator('#list li').nth(1)),
  ]);
  assert.equal(box, false);
  await page.close();
});

test('merge: a file dragged by its card moves above or below the one it is dropped on', async () => {
  const names = ['a.pdf', 'b.pdf', 'c.pdf'];
  const paths = [];
  for (const [i, name] of names.entries()) paths.push(await writePdf(app.dir, name, [{ size: 100 + 50 * i, text: name[0] }]));
  const page = await app.openApp();
  await page.setInputFiles('#files', paths);
  await page.locator('#list li').nth(2).waitFor();
  const order = () => page.locator('#list .name').allInnerTexts();

  await page.locator('#list li').nth(2).dragTo(page.locator('#list li').nth(0), { targetPosition: { x: 200, y: 4 } });
  assert.deepEqual(await order(), ['c.pdf', 'a.pdf', 'b.pdf']);
  await page.locator('#list li').nth(0).dragTo(page.locator('#list li').nth(2), { targetPosition: { x: 200, y: 40 } });
  assert.deepEqual(await order(), ['a.pdf', 'b.pdf', 'c.pdf']);
  assert.deepEqual(await page.locator('#preview-strip .group-name').allInnerTexts(), ['a.pdf', 'b.pdf', 'c.pdf']);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#merge').click()]);
  const saved = join(app.dir, 'dnd-merged.pdf');
  await download.saveAs(saved);
  assert.deepEqual((await PDFDocument.load(readFileSync(saved))).getPages().map((p) => p.getWidth()), [100, 150, 200]);
  await page.close();
});

test('pages: a card dragged to a new place carries the whole selection with it', async () => {
  const path = await writePdf(app.dir, 'four.pdf', [100, 200, 300, 400].map((size) => ({ size, text: String(size) })));
  const page = await app.openApp();
  await page.getByRole('tab', { name: 'Pages' }).click();
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

test('merge: the groups of the preview are dragged the same way, and the list follows', async () => {
  const names = ['x.pdf', 'y.pdf', 'z.pdf'];
  const paths = [];
  for (const [i, name] of names.entries()) paths.push(await writePdf(app.dir, name, [{ size: 100 + 50 * i, text: name[0] }]));
  const page = await app.openApp();
  await page.setInputFiles('#files', paths);
  await page.locator('#preview-strip .group').nth(2).waitFor();
  const strip = () => page.locator('#preview-strip .group-name').allInnerTexts();
  const list = () => page.locator('#list .name').allInnerTexts();

  await page.locator('#preview-strip .group').nth(2).dragTo(page.locator('#preview-strip .group').nth(0), { targetPosition: { x: 8, y: 30 } });
  assert.deepEqual(await strip(), ['z.pdf', 'x.pdf', 'y.pdf']);
  assert.deepEqual(await list(), ['z.pdf', 'x.pdf', 'y.pdf']);

  await page.locator('#list li').nth(0).dragTo(page.locator('#preview-strip .group').nth(2), { targetPosition: { x: 100, y: 30 } });
  assert.deepEqual(await strip(), ['x.pdf', 'y.pdf', 'z.pdf']);
  assert.deepEqual(await list(), ['x.pdf', 'y.pdf', 'z.pdf']);
  await page.close();
});
