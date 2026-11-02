import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension } from './support/browser.mjs';

const PAGES = 500;
let app;
let page;
before(async () => {
  app = await launchExtension();
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= PAGES; i++) {
    const sheet = document.addPage([612, 792]);
    sheet.drawText(`Page ${i}`, { x: 60, y: 700, size: 30, font });
    for (let line = 0; line < 30; line++) sheet.drawText(`Line ${line} of page ${i}, lorem ipsum dolor sit amet.`, { x: 60, y: 660 - line * 14, size: 9, font });
  }
  const path = join(app.dir, 'five-hundred.pdf');
  writeFileSync(path, await document.save());
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

test('a 500-page document opens, draws the pages in view, and every operation works on all of it', async () => {
  const started = Date.now();
  await page.locator('#grid li').nth(PAGES - 1).waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#grid canvas')).filter((canvas) => canvas.width !== 300).length >= 12, null, { timeout: 60_000 });
  assert.ok(Date.now() - started < 20_000, `opening took ${Date.now() - started} ms`);
  assert.ok((await page.evaluate(() => document.getElementsByTagName('*').length)) < 20_000, 'too many nodes in the page');

  await page.locator('#select-range').fill('2-499');
  await page.locator('#select-range').press('Enter');
  await page.locator('#hide').click();
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 498);
  assert.match(await page.locator('#selection-summary').innerText(), /498 hidden/);

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.locator('#download-all').click()]);
  const output = await PDFDocument.load(readFileSync(await download.path()));
  assert.equal(output.getPageCount(), 2);
});
