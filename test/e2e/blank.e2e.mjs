import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension } from './support/browser.mjs';

let app;
let page;
before(async () => {
  app = await launchExtension();
  // A scan of eight pages: text, empty, text, three specks of dust, text, a stamp, text, and faint noise.
  const document = await PDFDocument.create();
  const black = rgb(0, 0, 0);
  for (let i = 1; i <= 8; i++) {
    const sheet = document.addPage([300, 400]);
    if ([1, 3, 5, 7].includes(i)) for (let line = 0; line < 4; line++) sheet.drawRectangle({ x: 40, y: 300 - line * 40, width: 200, height: 10, color: black });
    if (i === 4) for (const x of [60, 150, 230]) sheet.drawRectangle({ x, y: 200, width: 4, height: 4, color: black });
    if (i === 6) sheet.drawRectangle({ x: 200, y: 60, width: 30, height: 30, color: black });
    if (i === 8) for (let n = 0; n < 40; n++) sheet.drawRectangle({ x: 10 + n * 7, y: 20 + (n % 5) * 60, width: 3, height: 3, color: rgb(0.93, 0.93, 0.93) });
  }
  const path = join(app.dir, 'scan.pdf');
  writeFileSync(path, await document.save());
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(7).waitFor();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

const flagged = async () => (await page.locator('#blank-pages li[data-blank] .blank-number').allInnerTexts()).map(Number);

test('the slider moves the line between blank and not blank, and the preview follows', async () => {
  await page.locator('#hide-blank').click();
  await page.locator('#blank-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#blank-pages li').length === 8);
  assert.equal(await page.locator('#blank-level').innerText().then((text) => /^A page with less than [\d.]+% of its surface inked counts as blank\.$/.test(text)), true);

  await page.locator('#blank-threshold').fill('0');
  assert.deepEqual(await flagged(), [2, 8], 'an empty page and a page of faint noise');
  assert.equal(await page.locator('#blank-count').innerText(), 'Pages to hide: 2 of 8');

  await page.locator('#blank-threshold').fill('60');
  assert.deepEqual(await flagged(), [2, 4, 8], 'the dust goes, the stamp stays');
  assert.equal(await page.locator('#blank-count').innerText(), 'Pages to hide: 3 of 8');

  await page.locator('#blank-threshold').fill('100');
  assert.deepEqual(await flagged(), [1, 2, 3, 4, 5, 6, 7, 8]);

  await page.locator('#blank-threshold').fill('60');
  await page.locator('#blank-threshold').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#blank-threshold').inputValue(), '59');
  assert.ok((await flagged()).includes(2));
});

test('applying hides the pages shown dimmed, cancelling hides nothing, and the pages can be shown again', async () => {
  await page.locator('#blank-cancel').click();
  await page.locator('#blank-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 0);

  await page.locator('#hide-blank').click();
  await page.locator('#blank-dialog').waitFor({ state: 'visible' });
  await page.locator('#blank-threshold').fill('60');
  await page.locator('#blank-apply').click();
  await page.locator('#blank-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('pages-status').textContent === 'Hid 3 blank pages.');
  assert.deepEqual(await page.locator('#grid li[data-hidden] .label').allInnerTexts(), ['2', '4', '8']);

  await page.locator('#hide-blank').click();
  await page.locator('#blank-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#blank-pages li').length === 5);
  assert.equal(await page.locator('#blank-count').innerText(), 'Pages to hide: 0 of 5', 'the hidden pages are not measured again');
  await page.locator('#blank-cancel').click();
  await page.locator('#undo').click();
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 0);
});
