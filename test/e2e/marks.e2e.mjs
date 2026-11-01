import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
let page;
let counter = 0;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

const card = (n) => page.getByRole('button', { name: new RegExp(`^Page ${n}(,|$)`) });

async function openDocument(count) {
  const path = await writePdf(app.dir, `marks-${counter++}.pdf`, Array.from({ length: count }, () => ({ size: 612 })));
  page = await app.openApp();
  await page.getByRole('tab', { name: 'Pages' }).click();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(count - 1).waitFor();
}

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return readFileSync(await download.path());
}

// For each page of a PDF: its text, and the dark pixels in a box given as fractions of the displayed page.
function inspect(bytes, box) {
  return page.evaluate(
    async ({ bytes, box }) => {
      const { openRender, renderPage } = await import('./render.js');
      const doc = await openRender(new Uint8Array(bytes));
      const out = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const sheet = await doc.getPage(i);
        const text = (await sheet.getTextContent()).items.map((item) => item.str).join(' ');
        const canvas = document.createElement('canvas');
        await renderPage(doc, i - 1, 0, canvas, 1);
        const x = Math.round(box.x * canvas.width);
        const y = Math.round(box.y * canvas.height);
        const { data } = canvas.getContext('2d').getImageData(x, y, Math.round(box.w * canvas.width), Math.round(box.h * canvas.height));
        let ink = 0;
        for (let p = 0; p < data.length; p += 4) if (data[p] + data[p + 1] + data[p + 2] < 300) ink++;
        out.push({ text, ink });
      }
      return out;
    },
    { bytes: Array.from(bytes), box },
  );
}

const BOTTOM_RIGHT = { x: 0.5, y: 0.76, w: 0.45, h: 0.2 };
const TOP_LEFT = { x: 0.05, y: 0.05, w: 0.5, h: 0.15 };

test('a typed signature is placed on every page, and is in the file as a picture', async () => {
  await openDocument(3);
  await page.locator('#sign').click();
  await page.locator('#sign-dialog').waitFor({ state: 'visible' });
  await page.locator('#sign-use').click();
  assert.match(await page.locator('#sign-error').innerText(), /Draw your signature first/);
  await page.getByRole('radio', { name: 'Type' }).check();
  await page.locator('#sign-text').fill('Jean Dupont');
  await page.locator('#sign-use').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#scope-selection').isHidden(), true);
  await page.getByRole('radio', { name: 'All the pages' }).check();
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });
  await page.locator('#grid .mark-img').nth(2).waitFor();
  assert.equal(await page.locator('#grid .mark-img').count(), 3);
  assert.match(await page.locator('#pages-status').innerText(), /Signature placed on 3 pages/);

  const pages = await inspect(await downloaded(() => page.locator('#download-all').click()), BOTTOM_RIGHT);
  assert.ok(pages.every((p) => p.ink > 150), `no signature on some pages: ${JSON.stringify(pages.map((p) => p.ink))}`);
  const clean = await inspect(await downloaded(() => page.locator('#download-all').click()), TOP_LEFT);
  assert.ok(clean.every((p) => p.ink === 0));
  await page.close();
});

test('a drawn signature can be dragged where it belongs before it is placed on one page', async () => {
  await openDocument(2);
  await page.locator('#sign').click();
  await page.locator('#sign-dialog').waitFor({ state: 'visible' });
  const pad = await page.locator('#sign-pad').boundingBox();
  await page.mouse.move(pad.x + pad.width * 0.15, pad.y + pad.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + pad.width * (0.15 + 0.06 * i), pad.y + pad.height * (0.6 - 0.3 * Math.sin(i / 2)), { steps: 2 });
  await page.mouse.up();
  await page.locator('#sign-use').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });

  const mark = page.locator('#place-layer .mark-draft');
  const start = await mark.boundingBox();
  const stage = await page.locator('#place-stage').boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.25, stage.y + stage.height * 0.12, { steps: 6 });
  await page.mouse.up();
  const moved = await mark.boundingBox();
  assert.ok(moved.y < start.y - stage.height * 0.4, 'the signature did not move up');
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });
  await page.locator('#grid .mark-img').first().waitFor();
  assert.equal(await page.locator('#grid .mark-img').count(), 1);

  const result = await inspect(await downloaded(() => page.locator('#download-all').click()), TOP_LEFT);
  assert.ok(result[0].ink > 40, `the signature is not where it was dropped: ${result[0].ink}`);
  assert.equal(result[1].ink, 0, 'the second page must stay clean');
  await page.close();
});

test('a text is placed upright on a rotated page, its characters are checked, and it can be removed again', async () => {
  await openDocument(2);
  await card(2).click();
  await page.locator('#rotate-right').click();
  await page.locator('#select-none').click();

  await card(2).click();
  await page.locator('#add-text').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  await page.locator('#place-text').fill('日本語');
  await page.locator('#place-go').click();
  assert.match(await page.locator('#place-error').innerText(), /cannot draw/);
  await page.locator('#place-text').fill('ROTATED-TEXT');
  await page.locator('#place-size').fill('45');
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });
  await page.locator('#grid .mark-text').waitFor();

  const pages = await inspect(await downloaded(() => page.locator('#download-all').click()), TOP_LEFT);
  assert.equal(pages[0].text, '');
  assert.match(pages[1].text, /ROTATED-TEXT/);
  assert.ok(pages[1].ink > 60, `the text is not upright at the top left: ${pages[1].ink}`);

  assert.equal(await page.locator('#clear-marks').isVisible(), true);
  await page.locator('#clear-marks').click();
  assert.equal(await page.locator('#grid .mark-text').count(), 0);
  assert.equal(await page.locator('#clear-marks').isHidden(), true);
  await page.locator('#undo').click();
  assert.equal(await page.locator('#grid .mark-text').count(), 1);
  await page.close();
});

test('a text can be placed and sized with the keyboard alone, and Today writes the date', async () => {
  await openDocument(1);
  await page.locator('#add-text').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  await page.locator('#place-date').click();
  assert.match(await page.locator('#place-text').inputValue(), /^\d{4}-\d{2}-\d{2}$/);
  const mark = page.locator('#place-layer .mark-draft');
  await mark.focus();
  const before = await mark.boundingBox();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  const after = await mark.boundingBox();
  assert.ok(after.x > before.x + 20 && after.y > before.y + 10, 'it did not move');
  assert.ok(after.width > before.width, 'it did not grow');
  await page.keyboard.press('Enter');
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });
  const text = await page.locator('#grid .mark-text').innerText();
  assert.match(text, /^\d{4}-\d{2}-\d{2}$/);
  await page.close();
});
