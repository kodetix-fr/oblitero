import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

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
const pressed = () => page.locator('#grid [aria-pressed="true"]').count();
let counter = 0;

async function openDocument(sizes, { text = true } = {}) {
  const path = await writePdf(app.dir, `doc-${counter++}.pdf`, sizes.map((size, i) => ({ size, text: text === true || (Array.isArray(text) && text.includes(i)) ? String(size) : '' })));
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(sizes.length - 1).waitFor();
  return path;
}

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return readFileSync(await download.path());
}

const output = async () => PDFDocument.load(await downloaded(() => page.locator('#download-all').click()));
const widths = async () => (await output()).getPages().map((p) => p.getWidth());

test('Insert PDF puts the pages of another file after the selection, and selects them', async () => {
  await openDocument([100, 200, 300]);
  const other = await writePdf(app.dir, 'other.pdf', [{ size: 500 }, { size: 600 }]);
  await card(2).click();
  await page.setInputFiles('#pages-file', other);
  await page.locator('#grid li').nth(4).waitFor();
  assert.equal(await pressed(), 2);
  assert.match(await page.locator('#pages-name').innerText(), /and 1 more/);
  assert.deepEqual(await widths(), [100, 200, 500, 600, 300]);
  await page.locator('#undo').click();
  assert.equal(await page.locator('#grid li').count(), 3);
  assert.deepEqual(await widths(), [100, 200, 300]);
  await page.close();
});

test('a PDF dropped on the grid lands next to the page nearest to the pointer', async () => {
  await openDocument([100, 200, 300]);
  const other = await writePdf(app.dir, 'dropped.pdf', [{ size: 700 }]);
  const bytes = Array.from(readFileSync(other));
  const first = await card(1).boundingBox();
  const send = (type, x, y) =>
    page.evaluate(
      ({ type, x, y, bytes }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.pdf', { type: 'application/pdf' }));
        document.body.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      },
      { type, x, y, bytes },
    );
  await send('dragover', first.x + 4, first.y + first.height / 2);
  assert.equal(await page.locator('#dropHint p').innerText(), 'Drop PDF files or photos to add them');
  await send('drop', first.x + 4, first.y + first.height / 2);
  await page.locator('#grid li').nth(3).waitFor();
  assert.deepEqual(await widths(), [700, 100, 200, 300]);
  await page.close();
});

test('a blank page takes the size of the page before it, and Duplicate copies each selected page', async () => {
  await openDocument([100, 200, 300]);
  await card(1).click();
  await page.locator('#add-blank').click();
  await page.locator('#grid li').nth(3).waitFor();
  assert.equal(await card(2).getAttribute('aria-label'), 'Page 2, blank');
  assert.equal(await pressed(), 1);
  assert.deepEqual(await widths(), [100, 100, 200, 300]);

  await page.locator('#select-all').click();
  await page.locator('#select-none').click();
  await card(3).click();
  await card(4).click();
  await page.locator('#duplicate').click();
  await page.locator('#grid li').nth(5).waitFor();
  assert.deepEqual(await widths(), [100, 100, 200, 200, 300, 300]);

  await page.locator('#select-none').click();
  await card(4).click();
  await page.locator('#rotate-right').click();
  const rotated = await output();
  assert.deepEqual(rotated.getPages().map((p) => p.getRotation().angle), [0, 0, 0, 90, 0, 0]);
  await page.close();
});

test('Select takes a list of pages, odd pages or even pages', async () => {
  await openDocument([100, 110, 120, 130, 140, 150]);
  await page.locator('#select-range').fill('2-3, 6');
  await page.locator('#select-range').press('Enter');
  assert.equal(await pressed(), 3);
  assert.equal(await card(2).getAttribute('aria-pressed'), 'true');
  assert.equal(await card(6).getAttribute('aria-pressed'), 'true');
  assert.equal(await card(1).getAttribute('aria-pressed'), 'false');

  await page.locator('#select-range').fill('nope');
  await page.locator('#select-range').press('Enter');
  assert.match(await page.locator('#pages-status').innerText(), /Not a list of pages/);

  await page.locator('#select-odd').click();
  assert.deepEqual([await card(1).getAttribute('aria-pressed'), await card(2).getAttribute('aria-pressed'), await card(5).getAttribute('aria-pressed')], ['true', 'false', 'true']);
  await page.locator('#select-even').click();
  assert.deepEqual([await card(1).getAttribute('aria-pressed'), await card(2).getAttribute('aria-pressed'), await card(6).getAttribute('aria-pressed')], ['false', 'true', 'true']);
  await page.close();
});

test('Hide blank pages hides the pages with no ink, and only those', async () => {
  await openDocument([100, 110, 120, 130, 140], { text: [0, 2, 4] });
  await page.locator('#hide-blank').click();
  await page.locator('#blank-dialog').waitFor({ state: 'visible' });
  await page.locator('#blank-apply').click();
  await page.locator('#grid li[data-hidden]').nth(1).waitFor();
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 2);
  assert.match(await page.locator('#pages-status').innerText(), /Hid 2 blank pages/);
  assert.deepEqual(await widths(), [100, 120, 140]);
  await page.locator('#hide-blank').click();
  await page.locator('#blank-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#blank-apply').isDisabled(), true);
  assert.equal(await page.locator('#blank-count').innerText(), 'Pages to hide: 0 of 3');
  await page.locator('#blank-cancel').click();
  await page.locator('#blank-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 2);
  await page.locator('#undo').click();
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 0);
  await page.locator('#redo').click();
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 2);
  await page.close();
});

test('Extract text writes the text of the shown pages, in order, to a .txt file', async () => {
  await openDocument([100, 200, 300]);
  await card(2).click();
  await page.locator('#hide').click();
  await page.locator('#select-none').click();
  const text = (await downloaded(() => page.locator('#extract-text').click())).toString('utf8');
  assert.match(text, /--- Page 1 ---\n100/);
  assert.match(text, /--- Page 3 ---\n300/);
  assert.ok(!text.includes('200'), 'a hidden page must not be in the text');
  await card(3).click();
  const selection = (await downloaded(() => page.locator('#extract-text').click())).toString('utf8');
  assert.ok(selection.includes('300') && !selection.includes('100'));
  await page.close();
});

test('Extract text says so for a page that has no text, as a scan does', async () => {
  await openDocument([100, 200], { text: [0] });
  const text = (await downloaded(() => page.locator('#extract-text').click())).toString('utf8');
  assert.match(text, /--- Page 1 ---\n100/);
  assert.match(text, /--- Page 2 ---\n\[no text on this page\]/);
  await page.close();
});

test('the size slider resizes the thumbnails', async () => {
  await openDocument([100, 200]);
  await page.waitForFunction(() => document.querySelector('#grid canvas').width > 0);
  const before = await page.locator('#grid .thumb canvas').first().boundingBox();
  await page.locator('#zoom').fill('240');
  const after = await page.locator('#grid .thumb canvas').first().boundingBox();
  assert.ok(after.width > before.width * 1.4, `${before.width} -> ${after.width}`);
  await page.close();
});

// Opens a downloaded PDF with PDF.js: the text of each page, and the ink found in the middle of the bottom edge as it is displayed.
function inspect(bytes) {
  return page.evaluate(async (bytes) => {
    const { openRender, renderPage } = await import('./render.js');
    const doc = await openRender(new Uint8Array(bytes));
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const sheet = await doc.getPage(i);
      const text = (await sheet.getTextContent()).items.map((item) => item.str).join(' ');
      const canvas = document.createElement('canvas');
      await renderPage(doc, i - 1, 0, canvas, 1);
      const { data } = canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2 - 35), canvas.height - 45, 70, 25);
      let ink = 0;
      for (let p = 0; p < data.length; p += 4) if (data[p] < 150) ink++;
      out.push({ text, ink });
    }
    return out;
  }, Array.from(bytes));
}

test('page numbers and a watermark are drawn on what is downloaded, upright on a rotated page too', async () => {
  await openDocument([300, 400, 500], { text: false });
  await card(2).click();
  await page.locator('#rotate-right').click();
  await page.locator('#select-none').click();

  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#numbers-on').check();
  await page.locator('#numbers-format').selectOption('of');
  await page.locator('#watermark-on').check();
  await page.locator('#watermark-text').fill('日本語');
  await page.locator('#stamp-apply').click();
  assert.match(await page.locator('#stamp-error').innerText(), /cannot draw/);
  assert.equal(await page.locator('#stamp-dialog').isVisible(), true);
  await page.locator('#watermark-text').fill('DRAFT');
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /numbered · watermark/.test(document.getElementById('selection-summary').textContent));

  const pages = await inspect(await downloaded(() => page.locator('#download-all').click()));
  assert.deepEqual(pages.map((p) => /\b(\d) \/ 3\b/.exec(p.text)?.[1]), ['1', '2', '3']);
  assert.ok(pages.every((p) => p.text.includes('DRAFT')));
  assert.ok(pages.every((p) => p.ink > 20), `no number at the bottom: ${JSON.stringify(pages.map((p) => p.ink))}`);

  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#numbers-skip').check();
  await page.locator('#watermark-on').uncheck();
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !/watermark/.test(document.getElementById('selection-summary').textContent));
  const skipped = await inspect(await downloaded(() => page.locator('#download-all').click()));
  assert.deepEqual(skipped.map((p) => /\b(\d) \/ 3\b/.exec(p.text)?.[1]), [undefined, '2', '3']);
  assert.ok(!skipped.some((p) => p.text.includes('DRAFT')));

  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#stamp-clear').click();
  await page.waitForFunction(() => !/numbered|watermark/.test(document.getElementById('selection-summary').textContent));
  await page.close();
});

test('a header and a footer with the page number go on the pages of a range, and a bad range is refused', async () => {
  await openDocument([300, 400, 500, 350], { text: false });
  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#header-on').check();
  await page.locator('#header-text').fill('HEAD {page} of {pages}');
  await page.locator('#footer-on').check();
  await page.locator('#footer-text').fill('FOOT');
  await page.locator('#footer-align').selectOption('right');
  await page.locator('#stamp-range').fill('nope');
  await page.locator('#stamp-apply').click();
  assert.match(await page.locator('#stamp-error').innerText(), /Not a list of pages/);
  assert.equal(await page.locator('#stamp-dialog').isVisible(), true);
  await page.locator('#stamp-range').fill('2-3');
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /header · footer/.test(document.getElementById('selection-summary').textContent));

  const pages = await inspect(await downloaded(() => page.locator('#download-all').click()));
  assert.deepEqual(pages.map((p) => /HEAD (\d) of (\d)/.exec(p.text)?.slice(1).join('/')), [undefined, '2/4', '3/4', undefined]);
  assert.deepEqual(pages.map((p) => p.text.includes('FOOT')), [false, true, true, false]);

  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#header-text').inputValue(), 'HEAD {page} of {pages}');
  assert.equal(await page.locator('#stamp-range').inputValue(), '2-3');
  await page.locator('#stamp-clear').click();
  await page.waitForFunction(() => !/header|footer/.test(document.getElementById('selection-summary').textContent));
  await page.close();
});

// A picture of one color, made by the browser itself.
async function redPicture(name) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 200, 100);
    return Array.from(new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
  });
  const path = join(app.dir, name);
  writeFileSync(path, Buffer.from(bytes));
  return path;
}

// The pink of the first page of a PDF: the color at its center and at its corner, and how many pixels are tinted.
async function tint(bytes) {
  return page.evaluate(async (bytes) => {
    const { openRender, renderPage } = await import('./render.js');
    const doc = await openRender(new Uint8Array(bytes));
    const canvas = document.createElement('canvas');
    await renderPage(doc, 0, 0, canvas, 1);
    const context = canvas.getContext('2d');
    const at = (x, y) => Array.from(context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data.slice(0, 3));
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let tinted = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 215 && data[i + 1] > 60) tinted++;
    return { center: at(canvas.width / 2, canvas.height / 2), corner: at(8, 8), tinted };
  }, Array.from(bytes));
}

test('an image watermark is where the settings say: centered at the width asked, as opaque as asked, and repeated when tiled', async () => {
  await openDocument([300, 300], { text: false });
  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#watermark-on').check();
  await page.locator('#watermark-kind').selectOption('image');
  assert.equal(await page.locator('#watermark-text-field').isHidden(), true);
  await page.locator('#stamp-apply').click();
  assert.equal(await page.locator('#stamp-error').innerText(), 'Choose an image first.');
  await page.locator('#watermark-file').setInputFiles(await redPicture('red.png'));
  await page.waitForFunction(() => document.getElementById('watermark-image-name').textContent === 'Image: red.png');
  await page.locator('#watermark-angle').fill('0');
  await page.locator('#watermark-scale').fill('60');
  await page.locator('#watermark-opacity').fill('50');
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /watermark/.test(document.getElementById('selection-summary').textContent));

  const single = await tint(await downloaded(() => page.locator('#download-all').click()));
  assert.ok(single.center[0] > 240 && single.center[1] > 100 && single.center[1] < 170 && single.center[2] < 170, `the center is half red: ${single.center}`);
  assert.deepEqual(single.corner, [255, 255, 255]);
  const expected = 180 * 90;
  assert.ok(Math.abs(single.tinted - expected) < expected * 0.1, `the mark is 180 by 90 pixels, ${single.tinted} are tinted`);

  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#watermark-image-name').innerText(), 'Image: red.png');
  await page.locator('#watermark-scale').fill('25');
  await page.locator('#watermark-tile').check();
  await page.locator('#stamp-apply').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'hidden' });
  const tiled = await tint(await downloaded(() => page.locator('#download-all').click()));
  assert.ok(tiled.tinted > 3 * 75 * 37 * 0.8, `several marks of 75 by 37 pixels: ${tiled.tinted}`);
  assert.ok(tiled.tinted < single.tinted * 1.6);
  await page.locator('#stamps').click();
  await page.locator('#stamp-dialog').waitFor({ state: 'visible' });
  await page.locator('#stamp-clear').click();
  await page.close();
});

test('Find and redact covers what it finds on every page, keeps what the user switches off, and spares the other pages', async () => {
  // Fake personal data, joined at run time so that no secret scanner reads it as one literal.
  const iban = ['FR76', '3000', '6000', '0112', '3456', '7890', '189'].join(' ');
  const card = ['4539', '5787', '6362', '1486'].join(' ');
  const path = await writePdf(app.dir, `secrets-${counter++}.pdf`, [
    { size: 612, text: ['Contact jean.dupont@example.org', 'Another line on page one'] },
    { size: 612, text: [`IBAN ${iban}`, `Card ${card}`] },
    { size: 612, text: ['KEEP-ME-ENTIRELY'] },
  ]);
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(2).waitFor();

  await page.locator('#find').click();
  await page.locator('#find-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#find-apply').isDisabled(), true);
  await page.locator('#find-run').click();
  await page.locator('#find-results li').nth(2).waitFor();
  assert.equal(await page.locator('#find-results li').count(), 3);
  assert.deepEqual(await page.locator('#find-results .page').allInnerTexts(), ['Page 1', 'Page 2', 'Page 2']);
  assert.match(await page.locator('#find-note').innerText(), /3 matches on 2 pages/);
  assert.equal(await page.locator('#find-apply-label').innerText(), 'Redact 3 matches');

  await page.locator('#find-results li').nth(2).getByRole('checkbox').uncheck();
  assert.equal(await page.locator('#find-apply-label').innerText(), 'Redact 2 matches');
  await page.locator('#find-apply').click();
  await page.locator('#find-dialog').waitFor({ state: 'hidden' });
  await page.locator('#grid .badge').nth(1).waitFor();
  assert.equal(await page.locator('#grid .badge').count(), 2);
  assert.match(await page.locator('#pages-status').innerText(), /Added 2 rectangles on 2 pages/);

  const out = await downloaded(() => page.locator('#download-all').click());
  const checked = await page.evaluate(async (bytes) => {
    const { openRender, renderPage } = await import('./render.js');
    const doc = await openRender(new Uint8Array(bytes));
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const sheet = await doc.getPage(i);
      const text = (await sheet.getTextContent()).items.map((item) => item.str).join(' ');
      const canvas = document.createElement('canvas');
      await renderPage(doc, i - 1, 0, canvas, 1);
      const [r, g, b] = canvas.getContext('2d').getImageData(120, 44, 1, 1).data;
      pages.push({ text, pixel: (r + g + b) / 3 });
    }
    return pages;
  }, Array.from(out));
  assert.equal(checked[0].text, '');
  assert.ok(checked[0].pixel < 30, `the e-mail is not covered: ${checked[0].pixel}`);
  assert.equal(checked[1].text, '');
  assert.match(checked[2].text, /KEEP-ME-ENTIRELY/);
  await page.close();
});
