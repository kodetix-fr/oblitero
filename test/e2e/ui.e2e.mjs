// The hierarchy of the screen: what shows when, and what the stamps preview draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchExtension, writePdf } from './support/browser.mjs';

const twoFiles = async (app, page) => {
  const first = await writePdf(app.dir, 'first.pdf', [{ size: 300, text: 'A1' }, { size: 300, text: 'A2' }]);
  const second = await writePdf(app.dir, 'second.pdf', [{ size: 300, text: 'B1' }]);
  await page.setInputFiles('#pages-file', [first, second]);
  await page.locator('#grid li').nth(2).waitFor();
};

test('the page actions appear with a selection, in a bar that keeps its place', async () => {
  const app = await launchExtension();
  try {
    const page = await app.openApp();
    assert.equal(await page.locator('.state-tools li').count(), 6);
    await twoFiles(app, page);
    const before = await page.locator('#grid').boundingBox();
    assert.equal(await page.locator('.sel-hint').isVisible(), true);
    assert.equal(await page.locator('#rotate-left').isVisible(), false);
    assert.equal(await page.locator('#download-selected').isVisible(), false);
    assert.equal(await page.locator('#download-parts').isVisible(), false);
    assert.equal(await page.locator('#result-summary').innerText(), '3 pages, 1 PDF file');

    await page.locator('#grid .card').nth(0).click();
    assert.equal(await page.locator('.sel-hint').isVisible(), false);
    assert.equal(await page.locator('#rotate-left').isVisible(), true);
    assert.equal(await page.locator('#download-selected').isVisible(), true);
    assert.deepEqual(await page.locator('#grid').boundingBox(), before);

    await page.locator('#grid .card').nth(1).click({ modifiers: ['Shift'] });
    assert.equal(await page.locator('#redact').isDisabled(), true);
    assert.match(await page.locator('#redact').getAttribute('title'), /one page/);

    await page.locator('#grid li .cut').nth(0).click({ force: true });
    assert.equal(await page.locator('#result-summary').innerText(), '3 pages, 2 PDF files in a ZIP');
    assert.equal(await page.locator('#download-parts').isVisible(), true);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('each file keeps one hue on its pages and on its row, and a single file has none', async () => {
  const app = await launchExtension();
  try {
    const page = await app.openApp();
    await twoFiles(app, page);
    const tones = await page.locator('#grid li').evaluateAll((items) => items.map((item) => item.style.getPropertyValue('--file-tone')));
    assert.equal(tones[0], tones[1]);
    assert.notEqual(tones[0], tones[2]);
    await page.locator('input[name="view"][value="files"]').check({ force: true });
    assert.equal(await page.locator('.file[data-file]').count(), 2);

    const lone = await app.openApp();
    await lone.setInputFiles('#pages-file', await writePdf(app.dir, 'lone.pdf', [{ size: 300, text: 'A' }]));
    await lone.locator('#grid li').first().waitFor();
    assert.equal(await lone.locator('#grid li[data-file]').count(), 0);
  } finally {
    await app.close();
  }
});

test('the stamps dialog folds what is off and previews what is on', async () => {
  const app = await launchExtension();
  try {
    const page = await app.openApp();
    await twoFiles(app, page);
    await page.locator('#stamps').click();
    const picture = () => page.locator('#stamp-canvas canvas').evaluate((canvas) => canvas.toDataURL());
    await page.locator('#stamp-canvas canvas').waitFor();
    const plain = await picture();
    assert.equal(await page.locator('#stamp-preview-page').innerText(), 'Page 1');
    assert.equal(await page.locator('#watermark-text').isVisible(), false);

    await page.locator('#watermark-on').check();
    assert.equal(await page.locator('#watermark-text').isVisible(), true);
    await page.waitForFunction((old) => document.querySelector('#stamp-canvas canvas').toDataURL() !== old, plain);

    await page.locator('#stamp-range').fill('3');
    await page.waitForFunction(() => document.querySelector('#stamp-preview-page').textContent === 'Page 3');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('the preview shows the PDF that will be downloaded, without the hidden pages', async () => {
  const app = await launchExtension();
  try {
    const page = await app.openApp();
    await twoFiles(app, page);
    await page.locator('#grid .card').nth(0).click();
    await page.locator('#hide').click();
    await page.locator('#preview-open').click();
    await page.locator('#preview-page canvas').waitFor();
    assert.match(await page.locator('#preview-caption').innerText(), /^2 pages, [\d.]+ K?B$/);
    assert.equal(await page.locator('#preview-count').innerText(), 'Page 1 of 2');
    assert.equal(await page.locator('#preview-prev').isDisabled(), true);

    await page.locator('#preview-next').click();
    await page.getByText('Page 2 of 2').waitFor();
    assert.equal(await page.locator('#preview-next').isDisabled(), true);

    await page.locator('#preview-close').click();
    assert.equal(await page.locator('#preview-dialog').isVisible(), false);
    assert.equal(await page.locator('#preview-open').isDisabled(), false);
  } finally {
    await app.close();
  }
});

test('the preview follows the selection and turns pages with the mouse wheel', async () => {
  const app = await launchExtension();
  try {
    const page = await app.openApp();
    await twoFiles(app, page);
    await page.locator('#select-odd').click();
    await page.locator('#preview-open').click();
    await page.locator('#preview-page canvas').waitFor();
    assert.equal(await page.locator('#preview-title').innerText(), 'Preview of the selection');
    assert.match(await page.locator('#preview-caption').innerText(), /^2 pages, /);

    const box = await page.locator('#preview-page canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 120);
    await page.getByText('Page 2 of 2').waitFor();
    // Another turn waits for the pause of the wheel; the listener of the test runs after the one of the preview.
    const { pause, flipped } = await page.evaluate(async () => ({ pause: (await import('/preview-view.js')).WHEEL_PAUSE_MS, flipped: performance.now() }));
    await page.waitForFunction(({ pause, flipped }) => performance.now() - flipped > pause, { pause, flipped });
    await page.evaluate(() => {
      window.wheelHandled = new Promise((resolve) => document.getElementById('preview-dialog').addEventListener('wheel', () => resolve(), { once: true }));
    });
    await page.mouse.wheel(0, 120);
    await page.evaluate(() => window.wheelHandled);
    assert.equal(await page.locator('#preview-count').innerText(), 'Page 2 of 2');
    await page.locator('#preview-close').click();

    await page.locator('#select-none').click();
    await page.locator('#preview-open').click();
    await page.locator('#preview-page canvas').waitFor();
    assert.equal(await page.locator('#preview-title').innerText(), 'Preview of the PDF');
    assert.match(await page.locator('#preview-caption').innerText(), /^3 pages, /);
  } finally {
    await app.close();
  }
});
