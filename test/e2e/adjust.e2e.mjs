import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb } from '../../vendor/pdf-lib.esm.min.js';
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

// A 300 point square page with a black bar from x 140 to 160, top to bottom, and a small square in the top left corner.
async function barPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 300]);
  page.drawRectangle({ x: 140, y: 0, width: 20, height: 300, color: rgb(0, 0, 0) });
  page.drawRectangle({ x: 10, y: 260, width: 30, height: 30, color: rgb(0, 0, 0) });
  const path = join(app.dir, 'bar.pdf');
  writeFileSync(path, await document.save());
  return path;
}

// Whether the points (in points from the top left) of the first page of `bytes` are dark, drawn by PDF.js in the extension,
// with the angle and the mirror of `adjusted` when it is given.
async function dark(page, bytes, points, adjusted = null) {
  return page.evaluate(
    async ({ data, points, adjusted }) => {
      const { openRender, renderPage } = await import('/render.js');
      const doc = await openRender(new Uint8Array(data));
      const canvas = document.createElement('canvas');
      await renderPage(doc, 0, 0, canvas, 1, adjusted);
      const context = canvas.getContext('2d');
      return points.map(([x, y]) => context.getImageData(x, y, 1, 1).data[0] < 100);
    },
    { data: [...bytes], points, adjusted },
  );
}

test('a page turned by 5 degrees and mirrored comes out as it is shown', async () => {
  const page = await app.openApp();
  const source = await barPdf();
  await page.setInputFiles('#pages-file', source);
  await page.locator('#grid li').first().waitFor();
  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    return readFileSync(await file.path());
  };
  await page.getByRole('button', { name: /^Page 1(,|$)/ }).click();
  await page.locator('#angle').fill('5');
  await page.locator('#angle').press('Enter');

  // Turned clockwise around the middle: the top of the bar goes right by about 13 points, its bottom goes left.
  const tilted = [[150 + 13, 5], [143, 5], [150 - 13, 295], [157, 295]];
  assert.deepEqual(await dark(page, await download(), tilted), [true, false, true, false]);
  assert.deepEqual(await dark(page, readFileSync(source), tilted, { angle: 5, flip: false }), [true, false, true, false]);

  await page.locator('#angle').fill('0');
  await page.locator('#angle').press('Enter');
  await page.locator('#flip-h').click();
  const mirrored = await download();
  assert.deepEqual(await dark(page, mirrored, [[275, 25], [25, 25], [150, 150]]), [true, false, true]);

  await page.locator('#rotate-right').click();
  const quarter = await PDFDocument.load(await download());
  assert.equal(quarter.getPage(0).getRotation().angle, 90);
  await page.close();
});
