import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
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

test('a long press with a finger drags a page, with the same ghost and insertion bar, and a quick swipe moves nothing and does not go back', async () => {
  const path = await writePdf(app.dir, 'touch.pdf', [100, 200, 300].map((size) => ({ size, text: String(size) })));
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(2).waitFor();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const center = async (n) => {
    const box = await page.locator('#grid li').nth(n).boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const labels = () => page.locator('#grid li').evaluateAll((items) => items.map((item) => item.dataset.id));
  const before = await labels();
  const longPress = await page.evaluate(async () => (await import('/dom.js')).LONG_PRESS_MS);

  const [x0, y0] = await center(0);
  const [x2, y2] = await center(2);
  await touch('touchStart', x0, y0);
  await page.locator('.drag-image.held').waitFor();
  assert.equal(await page.locator('.drag-image.held').count(), 1);
  await touch('touchMove', x0 + 20, y0);
  await touch('touchMove', x2 + 60, y2);
  assert.equal(await page.locator('#grid [data-drop="after"]').count(), 1);
  await touch('touchEnd');
  await page.waitForFunction((first) => document.querySelector('#grid li:last-child').dataset.id === first, before[0]);
  assert.deepEqual(await labels(), [before[1], before[2], before[0]]);
  assert.equal(await page.locator('.drag-image.held').count(), 0);
  assert.equal(await page.locator('#grid [aria-pressed="true"]').count(), 0);

  const moved = await labels();
  const [x1, y1] = await center(0);
  await touch('touchStart', x1, y1);
  await touch('touchMove', x1 + 40, y1);
  await touch('touchMove', x2 + 60, y2);
  await touch('touchEnd');
  // Nothing must happen: wait past the long press, which would have started a drag.
  await page.waitForTimeout(longPress + 200);
  assert.deepEqual(await labels(), moved);
  assert.equal(await page.locator('.drag-image.held').count(), 0);
  await page.close();
});
