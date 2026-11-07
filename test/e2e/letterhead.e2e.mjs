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

async function save(name, draw) {
  const document = await PDFDocument.create();
  draw(document);
  const path = join(app.dir, name);
  writeFileSync(path, await document.save());
  return path;
}

// The color at points (in points from the top left) of each page of `bytes`, drawn by PDF.js in the extension.
async function colors(page, bytes, points) {
  return page.evaluate(
    async ({ data, points }) => {
      const { openRender, renderPage } = await import('/render.js');
      const doc = await openRender(new Uint8Array(data));
      const found = [];
      for (let index = 0; index < doc.numPages; index++) {
        const canvas = document.createElement('canvas');
        await renderPage(doc, index, 0, canvas, 1);
        const context = canvas.getContext('2d');
        found.push(points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)]));
      }
      return found;
    },
    { data: [...bytes], points },
  );
}

test('a letterhead goes under the content of the pages of the range, and over it on request', async () => {
  // A blue band across the top of the paper; a black square in the middle of each page of the document, under the band too.
  const paper = await save('paper.pdf', (document) => document.addPage([300, 300]).drawRectangle({ x: 0, y: 260, width: 300, height: 40, color: rgb(0, 0, 1) }));
  const letter = await save('letter.pdf', (document) => {
    for (let i = 0; i < 2; i++) {
      const page = document.addPage([300, 300]);
      page.drawRectangle({ x: 140, y: 140, width: 20, height: 20, color: rgb(0, 0, 0) });
      page.drawRectangle({ x: 0, y: 270, width: 20, height: 20, color: rgb(0, 0, 0) });
    }
  });
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', letter);
  await page.locator('#grid li').nth(1).waitFor();
  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
    return readFileSync(await file.path());
  };
  const stamp = async (place) => {
    await page.locator('#stamps').click();
    await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
    await page.locator('#letterhead-file').setInputFiles(paper);
    await page.waitForFunction(() => document.getElementById('letterhead-name').textContent.includes('paper.pdf'));
    await page.locator('#letterhead-place').selectOption(place);
    await page.locator('#stamp-range').fill('2');
    await page.locator('#stamp-apply').click();
    await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  };
  const points = [[100, 20], [10, 20], [150, 150]];
  const white = [255, 255, 255];
  const blue = [0, 0, 255];
  const black = [0, 0, 0];

  await stamp('under');
  assert.deepEqual(await colors(page, await download(), points), [
    [white, black, black],
    [blue, black, black],
  ]);
  assert.match(await page.locator('#selection-summary').innerText(), /letterhead/);

  await stamp('over');
  assert.deepEqual((await colors(page, await download(), points))[1], [blue, blue, black]);
  await page.close();
});
