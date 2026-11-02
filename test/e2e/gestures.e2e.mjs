import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';
import { readZip } from './support/zip.mjs';

let app;
let page;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

const SIZES = [100, 200, 300, 400, 500];
const card = (n) => page.getByRole('button', { name: new RegExp(`^Page ${n}(,|$)`) });
const pressed = () => page.locator('#grid [aria-pressed="true"]').count();

async function openDocument() {
  const path = await writePdf(app.dir, `five-${Date.now()}.pdf`, SIZES.map((size) => ({ size, text: String(size) })));
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(4).waitFor();
}

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return readFileSync(await download.path());
}

const widths = async () => (await PDFDocument.load(await downloaded(() => page.locator('#download-all').click()))).getPages().map((p) => p.getWidth());

test('the scissors between two pages cuts the document there, and the parts are what the ZIP holds', async () => {
  await openDocument();
  assert.equal(await page.locator('#download-parts').isDisabled(), true);

  await page.locator('#grid li').nth(1).locator('.cut').click();
  assert.equal(await page.locator('#grid li[data-cut]').count(), 1);
  assert.match(await page.locator('#selection-summary').innerText(), /2 parts/);
  assert.equal(await page.locator('#grid li[data-part]').count(), 5);
  assert.equal(await page.locator('#parts-label').innerText(), 'Download 2 parts (ZIP)');

  const entries = readZip(await downloaded(() => page.locator('#download-parts').click()));
  assert.equal(entries.length, 2);
  assert.match(entries[0].name, /-001\.pdf$/);
  assert.match(entries[1].name, /-002\.pdf$/);
  const parts = await Promise.all(entries.map((entry) => PDFDocument.load(entry.data)));
  assert.deepEqual(parts.map((part) => part.getPages().map((p) => p.getWidth())), [[100, 200], [300, 400, 500]]);

  await page.locator('#grid li').nth(1).locator('.cut').click();
  assert.equal(await page.locator('#grid li[data-cut]').count(), 0);
  assert.equal(await page.locator('#download-parts').isDisabled(), true);
});

test('Cut every N pages, Cut on the selection, C on the keyboard, and Remove cuts', async () => {
  await page.locator('#split-size').fill('2');
  await page.locator('#cut-every').click();
  assert.equal(await page.locator('#grid li[data-cut]').count(), 2);
  assert.match(await page.locator('#selection-summary').innerText(), /3 parts/);

  await page.locator('#clear-cuts').click();
  assert.equal(await page.locator('#grid li[data-cut]').count(), 0);
  assert.equal(await page.locator('#clear-cuts').isHidden(), true);

  await card(3).click();
  await page.locator('#cut').click();
  assert.equal(await page.locator('#grid li[data-cut]').count(), 1);
  await page.locator('#cut').click();
  assert.equal(await page.locator('#grid li[data-cut]').count(), 0);
  await page.keyboard.press('c');
  assert.equal(await page.locator('#grid li[data-cut]').count(), 1);
  await page.locator('#select-none').click();
});

test('every change can be undone and redone, with the buttons and the keyboard', async () => {
  await page.locator('#clear-cuts').click();
  assert.equal(await page.locator('#redo').isDisabled(), true);
  const hiddenCount = () => page.locator('#grid li[data-hidden]').count();
  await card(1).click();
  await page.locator('#hide').click();
  assert.equal(await hiddenCount(), 1);
  await page.locator('#undo').click();
  assert.equal(await hiddenCount(), 0);
  assert.equal(await page.locator('#redo').isDisabled(), false);
  await page.keyboard.press('Control+Shift+Z');
  assert.equal(await hiddenCount(), 1);
  await page.keyboard.press('Control+Z');
  assert.equal(await hiddenCount(), 0);
  assert.deepEqual(await widths(), SIZES);
});

test('a rectangle drawn on the background selects the pages it touches', async () => {
  await page.locator('#select-all').click();
  await page.locator('#select-none').click();
  const first = await card(1).boundingBox();
  const third = await card(3).boundingBox();
  await page.mouse.move(first.x - 14, first.y - 14);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 6 });
  assert.equal(await page.locator('.marquee').count(), 1);
  await page.mouse.up();
  assert.equal(await page.locator('.marquee').count(), 0);
  assert.equal(await pressed(), 3);

  await page.mouse.click(first.x - 14, first.y + first.height + 60);
  assert.equal(await pressed(), 0);
});

test('the keyboard moves between pages and acts on the selection', async () => {
  await card(1).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.equal(await card(3).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Space');
  assert.equal(await pressed(), 1);
  await page.keyboard.press('r');
  const rotated = await PDFDocument.load(await downloaded(() => page.locator('#download-all').click()));
  assert.deepEqual(rotated.getPages().map((p) => p.getRotation().angle), [0, 0, 90, 0, 0]);
  await page.keyboard.press('Shift+R');
  await page.keyboard.press('Alt+ArrowLeft');
  assert.deepEqual(await widths(), [100, 300, 200, 400, 500]);
  await page.keyboard.press('Control+A');
  assert.equal(await pressed(), 5);
  await page.keyboard.press('Escape');
  assert.equal(await pressed(), 0);
  await card(2).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 1);
});

test('a page dropped on the empty space after the last one goes to the end', async () => {
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  assert.deepEqual(await widths(), SIZES);
  const grid = await page.locator('#grid').boundingBox();
  await page.locator('#grid li').nth(0).dragTo(page.locator('#grid'), { targetPosition: { x: grid.width - 4, y: 30 } });
  assert.deepEqual(await widths(), [200, 300, 400, 500, 100]);
});

test('Hide keeps a page in view but out of every result, and Show brings it back', async () => {
  await openDocument();
  await card(2).click();
  await card(4).click();
  assert.equal(await page.locator('#hide-label').innerText(), 'Hide');
  await page.locator('#hide').click();
  assert.equal(await page.locator('#grid li').count(), 5);
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 2);
  assert.equal(await page.locator('#grid .hidden-mark').count(), 2);
  assert.equal(await page.locator('#hide-label').innerText(), 'Show');
  assert.match(await page.locator('#selection-summary').innerText(), /2 hidden/);
  assert.equal(await page.locator('#show-hidden-label').innerText(), 'Show 2 hidden');
  assert.equal(await page.locator('#download-selected').isDisabled(), true);
  assert.deepEqual(await widths(), [100, 300, 500]);

  await page.locator('#select-all').click();
  await page.locator('#select-none').click();
  await card(2).click();
  assert.equal(await page.locator('#redact').isDisabled(), true);
  await page.locator('#select-none').click();

  await page.locator('#grid li').nth(1).locator('.cut').click();
  const entries = readZip(await downloaded(() => page.locator('#download-parts').click()));
  const parts = await Promise.all(entries.map((entry) => PDFDocument.load(entry.data)));
  assert.deepEqual(parts.map((part) => part.getPages().map((p) => p.getWidth())), [[100], [300, 500]]);

  await page.locator('#show-hidden').click();
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 0);
  assert.equal(await page.locator('#show-hidden').isHidden(), true);
  assert.deepEqual(await widths(), SIZES);

  await card(3).click();
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 1);
  await page.keyboard.press('h');
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 0);
});
