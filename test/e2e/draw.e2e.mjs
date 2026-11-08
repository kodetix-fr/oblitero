import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
let page;
before(async () => {
  app = await launchExtension();
  page = await app.openApp();
  await page.setInputFiles('#pages-file', await writePdf(app.dir, 'draw.pdf', [{ size: 300, text: '' }]));
  await page.locator('#grid li').first().waitFor();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

// Draws one shape from (fx1, fy1) to (fx2, fy2), fractions of the page, then downloads and gives the color at points.
async function drawAndRead(tool, color, from, to, points) {
  await page.locator('#draw').click();
  await page.locator('#draw-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#draw-overlay').evaluate((overlay) => getComputedStyle(overlay).backgroundColor), 'rgba(0, 0, 0, 0)', 'the shapes layer lets the page show');
  await page.locator(`input[name="draw-tool"][value="${tool}"]`).check();
  await page.locator('#draw-color').selectOption(color);
  const box = await page.locator('#draw-layer').boundingBox();
  const at = ([fx, fy]) => [box.x + fx * box.width, box.y + fy * box.height];
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 5 });
  await page.mouse.up();
  await page.locator('#draw-done').click();
  await page.locator('#draw-dialog').waitFor({ state: 'hidden' });
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const bytes = readFileSync(await file.path());
  return page.evaluate(
    async ({ data, points }) => {
      const { openRender, renderPage } = await import('/render.js');
      const canvas = document.createElement('canvas');
      await renderPage(await openRender(new Uint8Array(data)), 0, 0, canvas, 2);
      const context = canvas.getContext('2d');
      return points.map(([fx, fy]) => [...context.getImageData(Math.round(fx * canvas.width), Math.round(fy * canvas.height), 1, 1).data.slice(0, 3)]);
    },
    { data: [...bytes], points },
  );
}

const reddish = ([r, g, b]) => r > 150 && g < 100 && b < 100;
const bluish = ([r, , b]) => b > 150 && r < 100;
const yellowish = ([r, g, b]) => r > 230 && g > 200 && b < 200;
const white = ([r, g, b]) => r > 240 && g > 240 && b > 240;

test('the rectangle tool draws a frame into the page', async () => {
  const [edge, inside] = await drawAndRead('rect', 'red', [0.2, 0.2], [0.6, 0.5], [[0.2, 0.35], [0.4, 0.35]]);
  assert.ok(reddish(edge), String(edge));
  assert.ok(white(inside), String(inside));
});

test('the arrow tool draws a line with its head at the end', async () => {
  const [middle, away] = await drawAndRead('arrow', 'blue', [0.1, 0.8], [0.9, 0.8], [[0.5, 0.8], [0.5, 0.7]]);
  assert.ok(bluish(middle), String(middle));
  assert.ok(white(away), String(away));
});

test('the highlighter lays yellow over the page, and the shapes stay where they were drawn', async () => {
  const [inside, edge] = await drawAndRead('highlight', 'red', [0.1, 0.6], [0.4, 0.7], [[0.25, 0.65], [0.2, 0.35]]);
  assert.ok(yellowish(inside), String(inside));
  assert.ok(reddish(edge), String(edge));
});
