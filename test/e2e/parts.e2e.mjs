// The ways to place cuts without choosing the pages one by one, and the large view of a page.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFString, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
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

const card = (n) => page.getByRole('button', { name: new RegExp(`^Page ${n}(,|$)`) });
const status = () => page.locator('#pages-status');
const parts = () => page.locator('#parts-label').innerText();
const cutAfter = () => page.locator('#grid li').evaluateAll((items) => items.flatMap((item, index) => ('cut' in item.dataset ? [index + 1] : [])));

async function open(path, count) {
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(count - 1).waitFor();
}

// Eight pages. Chapters on pages 1, 3 (by a named destination) and 6, and a sub-entry on page 2 that must not cut.
async function writeOutlined(name) {
  const document = await PDFDocument.create();
  const pages = Array.from({ length: 8 }, () => document.addPage([300, 300]));
  const { context, catalog } = document;
  catalog.set(PDFName.of('Dests'), context.obj({ third: [pages[2].ref, PDFName.of('Fit')] }));
  const root = context.nextRef();
  const [one, two, three, sub] = [context.nextRef(), context.nextRef(), context.nextRef(), context.nextRef()];
  const entry = (title, fields) => context.obj({ Title: PDFString.of(title), Parent: root, ...fields });
  context.assign(one, entry('One', { Dest: [pages[0].ref, PDFName.of('Fit')], Next: two, First: sub, Last: sub, Count: 1 }));
  context.assign(sub, context.obj({ Title: PDFString.of('One, part two'), Parent: one, Dest: [pages[1].ref, PDFName.of('Fit')] }));
  context.assign(two, entry('Two', { Dest: PDFString.of('third'), Prev: one, Next: three }));
  context.assign(three, entry('Three', { Dest: [pages[5].ref, PDFName.of('Fit')], Prev: two }));
  context.assign(root, context.obj({ Type: PDFName.of('Outlines'), First: one, Last: three, Count: 3 }));
  catalog.set(PDFName.of('Outlines'), root);
  const path = join(app.dir, name);
  writeFileSync(path, await document.save());
  return path;
}

// Each page weighs about the same and does not compress away: hexadecimal noise.
async function writeHeavy(name, count) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Courier);
  for (let i = 0; i < count; i++) {
    const sheet = document.addPage([600, 800]);
    for (let line = 0; line < 60; line++) sheet.drawText(randomBytes(40).toString('hex'), { x: 10, y: 790 - line * 12, size: 6, font });
  }
  const path = join(app.dir, name);
  writeFileSync(path, await document.save());
  return path;
}

test('cut at the chapters: the top-level entries of the outline, whatever their form, and Undo', async () => {
  await open(await writeOutlined('outlined.pdf'), 8);
  try {
    await page.locator('#cut-chapters').click();
    await page.waitForFunction(() => document.querySelectorAll('#grid [data-cut]').length > 0);
    assert.deepEqual(await cutAfter(), [2, 5]);
    assert.match(await parts(), /3 parts/);
    await page.locator('#undo').click();
    assert.deepEqual(await cutAfter(), []);
  } finally {
    await page.close();
  }
});

test('cut at the chapters: a hidden first page does not change where the chapters start', async () => {
  await open(await writeOutlined('outlined.pdf'), 8);
  try {
    await card(1).click();
    await page.keyboard.press('h');
    await card(1).click();
    await page.locator('#cut-chapters').click();
    await page.waitForFunction(() => document.querySelectorAll('#grid [data-cut]').length > 0);
    assert.deepEqual(await cutAfter(), [2, 5]);
    assert.match(await parts(), /3 parts/);
  } finally {
    await page.close();
  }
});

test('cut at the chapters: a file without an outline says so and keeps its cuts', async () => {
  await open(await writePdf(app.dir, 'plain.pdf', [{ size: 200 }, { size: 200 }, { size: 200 }]), 3);
  try {
    await card(1).click();
    await page.keyboard.press('c');
    await page.locator('#cut-chapters').click();
    await page.waitForFunction(() => document.querySelector('#pages-status').textContent.includes('no outline'));
    assert.deepEqual(await cutAfter(), [1]);
  } finally {
    await page.close();
  }
});

test('cut after blank pages: the separator sheets are hidden, the parts are what is around them, and Undo', async () => {
  const sheets = ['one', 'two', '', 'three', '', 'four'].map((text) => ({ size: 300, text }));
  await open(await writePdf(app.dir, 'batch.pdf', sheets), 6);
  try {
    await page.locator('#cut-blank').click();
    await page.locator('#blank-dialog').waitFor({ state: 'visible' });
    await page.locator('#blank-apply').click();
    await page.locator('#blank-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('#grid [data-hidden]').length === 2);
    assert.deepEqual(await cutAfter(), [3, 5]);
    assert.match(await parts(), /3 parts/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-parts').click()]);
    const files = readZip(readFileSync(await download.path()));
    const counts = await Promise.all(files.map(async ({ data }) => (await PDFDocument.load(data)).getPageCount()));
    assert.deepEqual(counts, [2, 1, 1]);
    await page.locator('#undo').click();
    assert.deepEqual(await cutAfter(), []);
    assert.equal(await page.locator('#grid [data-hidden]').count(), 0);
  } finally {
    await page.close();
  }
});

test('cut under a size: no real part goes over it, the size announced is the real one, and every page is kept', async () => {
  await open(await writeHeavy('heavy.pdf', 12), 12);
  try {
    const limit = 40_000;
    await page.locator('#split-mb').fill(String(limit / 1_000_000));
    await page.locator('#cut-size').click();
    await page.waitForFunction(() => /parts, the largest is/.test(document.querySelector('#pages-status').textContent));
    const announced = Number(/([\d.,]+) KB/.exec(await status().innerText())[1].replace(',', '.')) * 1024;
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-parts').click()]);
    const files = readZip(readFileSync(await download.path()));
    assert.ok(files.length >= 2, `${files.length} parts`);
    const sizes = files.map(({ data }) => data.length);
    for (const size of sizes) assert.ok(size <= limit, `${size} bytes`);
    const counts = await Promise.all(files.map(async ({ data }) => (await PDFDocument.load(data)).getPageCount()));
    assert.equal(counts.reduce((sum, count) => sum + count, 0), 12);
    assert.ok(Math.abs(Math.max(...sizes) - announced) / announced < 0.03, `${Math.max(...sizes)} and ${announced}`);
    await page.locator('#undo').click();
    assert.deepEqual(await cutAfter(), []);
  } finally {
    await page.close();
  }
});

test('cut under a size: a size too small, one that holds everything, and no size at all', async () => {
  await open(await writeHeavy('light.pdf', 3), 3);
  try {
    await page.locator('#split-mb').fill('0.001');
    await page.locator('#cut-size').click();
    await page.waitForFunction(() => document.querySelector('#pages-status').textContent.includes('goes over the limit'));
    assert.deepEqual(await cutAfter(), [1, 2]);

    await page.locator('#split-mb').fill('100');
    await page.locator('#cut-size').click();
    await page.waitForFunction(() => document.querySelector('#pages-status').textContent.includes('No cut needed'));
    assert.deepEqual(await cutAfter(), []);

    await page.locator('#split-mb').fill('0');
    await page.locator('#cut-size').click();
    await page.waitForFunction(() => document.querySelector('#pages-status').textContent.includes('Type a size'));
  } finally {
    await page.close();
  }
});

test('the large view: double click or V, arrows and buttons, every kind of page, and the selection does not change', async () => {
  await open(await writePdf(app.dir, 'view.pdf', [{ size: 300, text: 'one' }, { size: 300, text: 'two' }, { size: 300, text: 'three' }]), 3);
  const count = () => page.locator('#preview-count').innerText();
  const painted = () => page.locator('#preview-page canvas').evaluate((canvas) => canvas.width);
  try {
    await card(3).click();
    await page.locator('#hide').click();
    await card(3).click();

    await card(2).dblclick();
    await page.locator('#preview-page canvas').waitFor();
    assert.equal(await count(), 'Page 2 of 3');
    assert.match(await page.locator('#preview-caption').innerText(), /view\.pdf/);
    assert.ok((await painted()) >= 860);
    assert.equal(await page.locator('#grid [aria-pressed="true"]').count(), 0);

    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#preview-count').textContent === 'Page 3 of 3');
    assert.equal(await page.locator('#preview-next').isDisabled(), true);
    assert.match(await page.locator('#preview-caption').innerText(), /hidden/i);
    await page.keyboard.press('ArrowRight');
    assert.equal(await count(), 'Page 3 of 3');
    await page.locator('#preview-prev').click();
    assert.equal(await count(), 'Page 2 of 3');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await count(), 'Page 1 of 3');
    assert.equal(await page.locator('#preview-prev').isDisabled(), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await count(), 'Page 2 of 3');
    // Closed and opened again at once: the close event of the first view comes after the second one opened.
    await page.evaluate(() => {
      document.getElementById('preview-dialog').close();
      const first = /** @type {HTMLElement} */ (document.querySelector('#grid .card'));
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
    });
    await page.locator('#preview-page canvas').waitFor();
    assert.equal(await count(), 'Page 1 of 3');
    await page.locator('#preview-close').click();

    await card(1).click();
    await page.locator('#add-blank').click();
    await page.getByRole('button', { name: /^Page 2, blank/i }).dblclick();
    await page.locator('#preview-page canvas').waitFor();
    assert.equal(await count(), 'Page 2 of 4');
    await page.locator('#preview-close').click();
  } finally {
    await page.close();
  }
});

test('the large view shows the rectangles of a page', async () => {
  await open(await writePdf(app.dir, 'covered.pdf', [{ size: 300 }, { size: 300 }]), 2);
  const dark = () =>
    page.locator('#preview-page canvas').evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 100) ink++;
      return ink / (canvas.width * canvas.height);
    });
  try {
    await card(1).dblclick();
    await page.locator('#preview-page canvas').waitFor();
    assert.equal(await dark(), 0);
    await page.locator('#preview-close').click();

    await card(1).click();
    await page.locator('#redact').click();
    await page.locator('#redact-dialog').waitFor({ state: 'visible' });
    const box = await page.locator('#redact-layer').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.up();
    await page.locator('#redact-done').click();
    await page.locator('#redact-dialog').waitFor({ state: 'hidden' });

    await card(1).dblclick();
    await page.locator('#preview-page canvas').waitFor();
    assert.ok((await dark()) > 0.1);
    await page.locator('#preview-close').click();
  } finally {
    await page.close();
  }
});

test('the size of the thumbnails lasts for the session only', async () => {
  await open(await writePdf(app.dir, 'size.pdf', [{ size: 200 }]), 1);
  try {
    await page.locator('#zoom').fill('240');
    assert.equal(await page.locator('#grid').evaluate((grid) => grid.style.getPropertyValue('--thumb-w')), '240px');
    await page.reload();
    assert.equal(await page.locator('#zoom').inputValue(), '150');
  } finally {
    await page.close();
  }
});
