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

test('merge: add, reorder, remove, download in the displayed order', async () => {
  const first = await writePdf(app.dir, 'first.pdf', [{ size: 100 }]);
  const second = await writePdf(app.dir, 'second.pdf', [{ size: 200 }, { size: 300 }]);
  const broken = join(app.dir, 'broken.pdf');
  writeFileSync(broken, 'not a pdf');

  const page = await app.openApp();
  assert.equal(await page.locator('#merge').isDisabled(), true);

  await page.setInputFiles('#files', [first, second, broken]);
  await page.locator('#list li').nth(1).waitFor();
  assert.equal(await page.locator('#list li').count(), 2);
  assert.match(await page.locator('#status').innerText(), /Cannot read broken\.pdf/);
  assert.deepEqual(await page.locator('#list .pages').allInnerTexts(), ['1 page', '2 pages']);

  await page.getByRole('button', { name: 'first.pdf: Down' }).click();
  assert.deepEqual(await page.locator('#list .name').allInnerTexts(), ['second.pdf', 'first.pdf']);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#merge').click()]);
  assert.equal(download.suggestedFilename(), 'merged.pdf');
  const saved = join(app.dir, 'merged.pdf');
  await download.saveAs(saved);
  const merged = await PDFDocument.load(readFileSync(saved));
  assert.deepEqual(merged.getPages().map((p) => p.getWidth()), [200, 300, 100]);

  await page.getByRole('button', { name: 'first.pdf: Remove' }).click();
  assert.equal(await page.locator('#merge').isDisabled(), true);
  await page.close();
});
