import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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

test('the extension asks for no permission', async () => {
  const manifest = await app.worker.evaluate(() => chrome.runtime.getManifest());
  assert.deepEqual(manifest.permissions ?? [], []);
  assert.equal(manifest.host_permissions, undefined);
});

test('the toolbar icon opens the app in a tab', async () => {
  const opened = app.context.waitForEvent('page');
  await app.worker.evaluate(() => chrome.action.onClicked.dispatch({ id: 1 }));
  const page = await opened;
  await page.waitForURL(`chrome-extension://${app.id}/app.html`);
  await page.close();
});

const filesView = (page) => page.getByRole('radio', { name: 'Files' }).check();
const pagesView = (page) => page.getByRole('radio', { name: 'Pages' }).check();

test('files: PDFs are added together, reordered, hidden and removed, and the download follows', async () => {
  const first = await writePdf(app.dir, 'first.pdf', [{ size: 100, text: 'A' }]);
  const second = await writePdf(app.dir, 'second.pdf', [{ size: 200, text: 'B' }, { size: 300, text: 'C' }]);
  const broken = join(app.dir, 'broken.pdf');
  writeFileSync(broken, 'not a pdf');

  const page = await app.openApp();
  assert.equal(await page.locator('#download-all').isHidden(), true);

  await page.setInputFiles('#pages-file', [first, second, broken]);
  await page.locator('#grid li').nth(2).waitFor();
  assert.match(await page.locator('#pages-status').innerText(), /Cannot read broken\.pdf/);
  assert.match(await page.locator('#pages-name').innerText(), /first\.pdf and 1 more/);

  await filesView(page);
  assert.deepEqual(await page.locator('#file-list .name').allInnerTexts(), ['first.pdf', 'second.pdf']);
  assert.deepEqual(await page.locator('#file-list .pages').allInnerTexts(), ['1 page', '2 pages']);
  await page.getByRole('button', { name: 'first.pdf: Down' }).click();
  assert.deepEqual(await page.locator('#file-list .name').allInnerTexts(), ['second.pdf', 'first.pdf']);

  const widths = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    const saved = join(app.dir, `files-${Date.now()}.pdf`);
    await download.saveAs(saved);
    return { name: download.suggestedFilename(), widths: (await PDFDocument.load(readFileSync(saved))).getPages().map((p) => p.getWidth()) };
  };
  assert.deepEqual(await widths(), { name: 'second-edited.pdf', widths: [200, 300, 100] });

  await page.getByRole('button', { name: 'second.pdf: Hide' }).click();
  assert.deepEqual(await page.locator('#file-list .pages').allInnerTexts(), ['2 pages, 2 hidden', '1 page']);
  assert.deepEqual((await widths()).widths, [100]);
  await page.getByRole('button', { name: 'second.pdf: Show' }).click();
  assert.deepEqual((await widths()).widths, [200, 300, 100]);

  await page.getByRole('button', { name: 'second.pdf: Remove' }).click();
  assert.deepEqual(await page.locator('#file-list .name').allInnerTexts(), ['first.pdf']);
  assert.deepEqual((await widths()).widths, [100]);
  await page.locator('#undo').click();
  assert.deepEqual(await page.locator('#file-list .name').allInnerTexts(), ['second.pdf', 'first.pdf']);
  await page.close();
});

test('files: opening a file shows its pages selected, and the Files view brings back the whole', async () => {
  const one = await writePdf(app.dir, 'one.pdf', [{ size: 100, text: 'A' }, { size: 100, text: 'B' }]);
  const two = await writePdf(app.dir, 'two.pdf', [1, 2, 3].map((n) => ({ size: 100, text: `P${n}` })));
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', [one, two]);
  await page.locator('#grid li').nth(4).waitFor();
  await filesView(page);
  assert.equal(await page.locator('#grid').isHidden(), true);
  assert.equal(await page.locator('#add-blank').isHidden(), true);

  await page.getByRole('button', { name: 'two.pdf: Open its pages' }).click();
  assert.equal(await page.locator('#grid').isVisible(), true);
  assert.equal(await page.getByRole('radio', { name: 'Pages' }).isChecked(), true);
  assert.match(await page.locator('#selection-summary').innerText(), /3 of 5 selected/);
  assert.deepEqual(await page.locator('#grid .card[aria-pressed="true"] .label').allInnerTexts(), ['3', '4', '5']);

  await filesView(page);
  assert.equal(await page.locator('#file-list li').count(), 2);
  await pagesView(page);
  assert.equal(await page.locator('#grid li').count(), 5);
  await page.close();
});

test('files: Clear empties the screen and Undo brings the files back', async () => {
  const path = await writePdf(app.dir, 'clear.pdf', [{ size: 100 }, { size: 100 }]);
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(1).waitFor();
  await page.locator('#clear-all').click();
  assert.equal(await page.locator('.state').isVisible(), true);
  assert.equal(await page.locator('#grid li').count(), 0);
  await page.locator('#undo').click();
  assert.equal(await page.locator('#grid li').count(), 2);
  await page.close();
});

test('files: the pages of two files taken apart stay two files, and the tags name them', async () => {
  const one = await writePdf(app.dir, 'left.pdf', [{ size: 100 }, { size: 100 }]);
  const two = await writePdf(app.dir, 'right.pdf', [{ size: 100 }]);
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', [one, two]);
  await page.locator('#grid li').nth(2).waitFor();
  assert.deepEqual(await page.locator('#grid .run-tag').allInnerTexts(), ['left.pdf', 'right.pdf']);
  await page.getByRole('button', { name: /^Page 3$/ }).click();
  await page.locator('#move-earlier').click();
  await page.locator('#move-earlier').click();
  assert.deepEqual(await page.locator('#grid .run-tag').allInnerTexts(), ['right.pdf', 'left.pdf']);
  await filesView(page);
  assert.deepEqual(await page.locator('#file-list .name').allInnerTexts(), ['right.pdf', 'left.pdf']);
  await page.close();
});
