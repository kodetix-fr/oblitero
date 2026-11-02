import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
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

// A page of two columns drawn line by line (left, right, left, right...), under a header and above a footer.
async function columnsPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 500]);
  page.drawText('HEADER across the whole page, in a larger size', { x: 40, y: 460, size: 20, font });
  for (let i = 1; i <= 6; i++) {
    page.drawText(`LEFT-${i} some words of the left column`, { x: 40, y: 400 - i * 16, size: 11, font });
    page.drawText(`RIGHT-${i} some words of the right column`, { x: 320, y: 400 - i * 16, size: 11, font });
  }
  page.drawText('FOOTER', { x: 40, y: 20, size: 10, font });
  const path = join(app.dir, 'colonnes.pdf');
  writeFileSync(path, await document.save());
  return path;
}

test('the text of a page with two columns is read column by column, under its header', async () => {
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', await columnsPdf());
  await page.locator('#grid li').first().waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#extract-text').click()]);
  const text = readFileSync(await download.path(), 'utf8');
  const at = (marker) => text.indexOf(marker);
  const order = ['HEADER', 'LEFT-1', 'LEFT-2', 'LEFT-6', 'RIGHT-1', 'RIGHT-2', 'RIGHT-6', 'FOOTER'];
  assert.ok(order.every((marker) => at(marker) >= 0), text);
  assert.deepEqual([...order].sort((a, b) => at(a) - at(b)), order, text);
  assert.ok(!/LEFT-\d[^\n]*RIGHT-\d/.test(text), 'no line holds text of both columns');
  await page.close();
});
