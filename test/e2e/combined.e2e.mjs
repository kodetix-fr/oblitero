// What the other scenarios leave out: tools used together on one page, and the less common ways into a tool.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
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
const pressed = () => page.locator('#grid [aria-pressed="true"]').count();

async function open(path, count) {
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(count - 1).waitFor();
}

async function downloaded(trigger = () => page.locator('#download-all').click()) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return readFileSync(await download.path());
}

// For each page of a PDF: its text, its size once rotated, and the dark pixels in a box given as fractions of the page.
function inspect(bytes, box = { x: 0, y: 0, w: 1, h: 1 }) {
  return page.evaluate(
    async ({ bytes, box }) => {
      const { openRender } = await import('./render.js');
      const doc = await openRender(new Uint8Array(bytes));
      const out = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const sheet = await doc.getPage(i);
        const viewport = sheet.getViewport({ scale: 1 });
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
        await sheet.render({ canvas, viewport }).promise;
        const { data } = canvas.getContext('2d').getImageData(box.x * canvas.width, box.y * canvas.height, box.w * canvas.width, box.h * canvas.height);
        let ink = 0;
        for (let p = 0; p < data.length; p += 4) if (data[p + 3] > 0 && data[p] + data[p + 1] + data[p + 2] < 300) ink++;
        const text = (await sheet.getTextContent()).items.map((item) => item.str).join(' ');
        out.push({ text, ink, width: Math.round(viewport.width), height: Math.round(viewport.height) });
      }
      return out;
    },
    { bytes: Array.from(bytes), box },
  );
}

async function drawRectangle(from, to) {
  const bounds = await page.locator('#redact-layer').boundingBox();
  await page.mouse.move(bounds.x + from[0] * bounds.width, bounds.y + from[1] * bounds.height);
  await page.mouse.down();
  await page.mouse.move(bounds.x + to[0] * bounds.width, bounds.y + to[1] * bounds.height, { steps: 4 });
  await page.mouse.up();
}

// A black disc on white paper: the corners of its box show whether the paper was made transparent.
async function signatureScan() {
  const data = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 200, height: 200 });
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 200, 200);
    context.fillStyle = '#000';
    context.beginPath();
    context.arc(100, 100, 60, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png');
  });
  const path = join(app.dir, 'scan.png');
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
  return path;
}

const cornerAlpha = () =>
  page.locator('#place-layer .mark-draft img').evaluate(async (picture) => {
    await picture.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: picture.naturalWidth, height: picture.naturalHeight });
    const context = canvas.getContext('2d');
    context.drawImage(picture, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  });

test('an imported scan is a signature on transparent paper, or on its paper, and its handle resizes it', async () => {
  await open(await writePdf(app.dir, `sign-${counter++}.pdf`, [{ size: 612 }]), 1);
  const scan = await signatureScan();
  await page.locator('#sign').click();
  await page.getByRole('radio', { name: 'Image' }).check();
  await page.locator('#sign-file').setInputFiles(scan);
  await page.locator('#sign-white').uncheck();
  await page.waitForFunction(() => document.getElementById('sign-white').checked === false);
  await page.locator('#sign-use').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  assert.equal(await cornerAlpha(), 255, 'the paper was asked to stay');
  await page.locator('#place-cancel').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });

  await page.locator('#sign').click();
  await page.getByRole('radio', { name: 'Image' }).check();
  await page.locator('#sign-file').setInputFiles(scan);
  await page.locator('#sign-white').check();
  await page.locator('#sign-use').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  assert.equal(await cornerAlpha(), 0, 'the paper was asked to go');

  const mark = page.locator('#place-layer .mark-draft');
  const before = await mark.boundingBox();
  const handle = await mark.locator('.handle').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - before.width / 2, handle.y, { steps: 4 });
  await page.mouse.up();
  const after = await mark.boundingBox();
  assert.ok(after.width < before.width * 0.7, `the handle did not shrink it: ${before.width} to ${after.width}`);
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });
  const [result] = await inspect(await downloaded());
  assert.ok(result.ink > 50, `no signature in the file: ${result.ink}`);
  await page.close();
});

test('a redacted page keeps its signature and its text in the file and in the exported image, and the source text goes', async () => {
  await open(await writePdf(app.dir, `both-${counter++}.pdf`, [{ size: 400, text: 'TOP-SECRET' }]), 1);
  const scan = await signatureScan();
  await page.locator('#sign').click();
  await page.getByRole('radio', { name: 'Image' }).check();
  await page.locator('#sign-file').setInputFiles(scan);
  await page.locator('#sign-use').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });

  await card(1).click();
  await page.locator('#add-text').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  await page.locator('#place-text').fill('APPROVED');
  await page.locator('#place-size').fill('60');
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });

  const lowerHalf = { x: 0, y: 0.5, w: 1, h: 0.5 };
  const [plain] = await inspect(await downloaded(), lowerHalf);
  assert.ok(plain.ink > 50, 'the marks are on the lower half of the page');

  await page.locator('#redact').click();
  await page.locator('#redact-dialog').waitFor({ state: 'visible' });
  await drawRectangle([0.02, 0.02], [0.98, 0.25]);
  await page.locator('#redact-done').click();
  await page.locator('#grid .box').waitFor();

  const [redacted] = await inspect(await downloaded(), { x: 0.3, y: 0.05, w: 0.4, h: 0.1 });
  assert.ok(!redacted.text.includes('TOP-SECRET'), redacted.text);
  assert.ok(redacted.ink > 1000, `the rectangle is not black: ${redacted.ink}`);
  const [kept] = await inspect(await downloaded(), lowerHalf);
  assert.ok(kept.ink >= plain.ink * 0.8, `the marks did not survive: ${plain.ink} to ${kept.ink}`);

  await page.locator('#export-images').click();
  await page.locator('#export-format').selectOption('image/png');
  await page.locator('#export-dpi').selectOption('72');
  const image = await downloaded(() => page.locator('#export-go').click());
  const ink = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, bitmap.height / 2, bitmap.width, bitmap.height / 2);
    let dark = 0;
    for (let p = 0; p < data.length; p += 4) if (data[p] + data[p + 1] + data[p + 2] < 300) dark++;
    return dark;
  }, Array.from(image));
  assert.ok(ink >= plain.ink * 0.8, `the marks are not in the exported image: ${ink} against ${plain.ink}`);
  await page.close();
});

test('a blank page rotates, passes its size on, is exported at its size, and counts as blank', async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 500]);
  const path = join(app.dir, `tall-${counter++}.pdf`);
  writeFileSync(path, await source.save());
  await open(path, 1);

  await card(1).click();
  await page.locator('#add-blank').click();
  await page.locator('#grid li').nth(1).waitFor();
  await page.locator('#select-none').click();
  await card(2).click();
  await page.locator('#rotate-right').click();
  await page.locator('#add-blank').click();
  await page.locator('#grid li').nth(2).waitFor();
  const sizes = (await inspect(await downloaded())).map(({ width, height }) => [width, height]);
  assert.deepEqual(sizes, [[300, 500], [500, 300], [500, 300]]);

  await page.locator('#select-none').click();
  await card(2).click();
  await page.locator('#export-images').click();
  await page.locator('#export-format').selectOption('image/png');
  await page.locator('#export-dpi').selectOption('72');
  const single = await downloaded(() => page.locator('#export-go').click());
  assert.deepEqual([single.readUInt32BE(16), single.readUInt32BE(20)], [500, 300]);

  await page.locator('#select-none').click();
  await page.locator('#hide-blank').click();
  await page.waitForFunction(() => document.querySelectorAll('#blank-pages li').length === 3);
  await page.locator('#blank-threshold').fill('0');
  assert.equal(await page.locator('#blank-count').innerText(), 'Pages to hide: 3 of 3', 'the source page is empty too');
  await page.locator('#blank-cancel').click();

  await page.getByRole('radio', { name: 'Files' }).check();
  await page.locator('#file-list li canvas').first().waitFor();
  await page.close();
});

test('a rectangle too small is not added, and Undo takes back the last one', async () => {
  await open(await writePdf(app.dir, `small-${counter++}.pdf`, [{ size: 400, text: 'HELLO' }]), 1);
  await card(1).click();
  await page.locator('#redact').click();
  await page.locator('#redact-dialog').waitFor({ state: 'visible' });
  const boxes = page.locator('#redact-layer .box');
  await drawRectangle([0.1, 0.1], [0.5, 0.5]);
  await drawRectangle([0.6, 0.6], [0.9, 0.9]);
  assert.equal(await boxes.count(), 2);
  await page.locator('#redact-undo').click();
  assert.equal(await boxes.count(), 1);

  await page.locator('#redact-layer').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#redact-live').innerText(), 'Too small, nothing added.');
  assert.equal(await boxes.count(), 1);
  await page.locator('#redact-done').click();
  await page.locator('#grid .box').waitFor();
  assert.equal(await page.locator('#grid .box').count(), 1);
  await page.close();
});

test('Find and redact looks for a word, says which pages it could not read, and switches all the matches at once', async () => {
  await open(await writePdf(app.dir, `words-${counter++}.pdf`, [{ size: 612, text: 'The budget of Budget Inc' }, { size: 612 }]), 2);
  await page.locator('#find').click();
  await page.locator('#find-dialog').waitFor({ state: 'visible' });
  await page.locator('#find-words').fill('budget');
  await page.locator('#find-run').click();
  await page.locator('#find-results li').nth(1).waitFor();
  assert.equal(await page.locator('#find-results li').count(), 2, 'both, whatever their case');
  assert.match(await page.locator('#find-note').innerText(), /1 page without a text layer/i);
  await page.locator('#find-toggle').click();
  assert.equal(await page.locator('#find-apply').isDisabled(), true);
  await page.locator('#find-toggle').click();
  assert.equal(await page.locator('#find-apply').isDisabled(), false);
  await page.locator('#find-cancel').click();
  await page.close();
});

test('the author and the subject typed by the user are written', async () => {
  await open(await writePdf(app.dir, `author-${counter++}.pdf`, [{ size: 100 }]), 1);
  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  await page.locator('#props-author').fill('A. Writer');
  await page.locator('#props-subject').fill('A subject');
  await page.locator('#props-apply').click();
  await page.waitForFunction(() => document.getElementById('selection-summary').textContent.includes('properties'));
  const written = await PDFDocument.load(await downloaded());
  assert.equal(written.getAuthor(), 'A. Writer');
  assert.equal(written.getSubject(), 'A subject');
  await page.close();
});

test('Shift and an arrow extend the selection from the keyboard, and H hides it', async () => {
  await open(await writePdf(app.dir, `keys-${counter++}.pdf`, [100, 200, 300, 400].map((size) => ({ size }))), 4);
  await card(1).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  assert.equal(await pressed(), 3);
  await page.keyboard.press('h');
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 3);
  await page.keyboard.press('h');
  assert.equal(await page.locator('#grid li[data-hidden]').count(), 0);
  await page.close();
});

test('an encrypted PDF whose password is not given is refused, and what is open stays', async () => {
  const body = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>',
    `<</Filter/Standard/V 1/R 2/O<${'00'.repeat(32)}>/U<${'11'.repeat(32)}>/P -4>>`,
  ];
  let file = '%PDF-1.4\n';
  const offsets = body.map((object, index) => {
    const at = file.length;
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return at;
  });
  const xref = file.length;
  file += `xref\n0 5\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  file += `trailer\n<</Size 5/Root 1 0 R/Encrypt 4 0 R/ID[<00><00>]>>\nstartxref\n${xref}\n%%EOF\n`;
  const encrypted = join(app.dir, 'locked.pdf');
  writeFileSync(encrypted, file);

  await open(await writePdf(app.dir, `open-${counter++}.pdf`, [{ size: 100 }]), 1);
  await page.setInputFiles('#pages-file', encrypted);
  await page.locator('#password-dialog').waitFor({ state: 'visible' });
  await page.locator('#password-cancel').click();
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.includes('locked.pdf'));
  assert.match(await page.locator('#pages-status').innerText(), /locked\.pdf: not opened, no password given/);
  assert.ok(await page.locator('#pages-status').evaluate((status) => status.hasAttribute('data-warn')));
  assert.equal(await page.locator('#grid li').count(), 1);
  await page.close();
});

test('a form: a field on two pages, a limit of length, a free choice, and a box unchecked', async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([500, 500]);
  const second = document.addPage([500, 500]);
  first.drawText('FIRST', { x: 20, y: 470, size: 14, font });
  const form = document.getForm();
  const code = form.createTextField('code');
  code.setMaxLength(5);
  code.addToPage(first, { x: 20, y: 420, width: 200, height: 24 });
  code.addToPage(second, { x: 20, y: 420, width: 200, height: 24 });
  const town = form.createDropdown('town');
  town.addOptions(['Paris', 'Lyon']);
  town.enableEditing();
  town.addToPage(first, { x: 20, y: 380, width: 200, height: 24 });
  const box = form.createCheckBox('agree');
  box.addToPage(first, { x: 20, y: 300, width: 60, height: 60 });
  box.check();
  const path = join(app.dir, `form-${counter++}.pdf`);
  writeFileSync(path, await document.save());
  await open(path, 2);

  await page.locator('#fill-form').click();
  await page.locator('#form-dialog').waitFor({ state: 'visible' });
  const row = (label) => page.locator('#form-fields .form-row').filter({ has: page.locator('.form-label', { hasText: label }) });
  assert.match(await row('code').innerText(), /Pages? 1.*2|1, 2/s);
  await row('code').locator('input').pressSequentially('ABCDEFGH');
  assert.equal(await row('code').locator('input').inputValue(), 'ABCDE');
  await row('town').locator('input').fill('Nantes');
  assert.equal(await row('agree').locator('input').isChecked(), true);
  await row('agree').locator('input').uncheck();
  await page.locator('#form-apply').click();
  await page.locator('#form-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => globalThis.document.getElementById('pages-status').textContent.startsWith('The form is filled'));

  const result = await inspect(await downloaded(), { x: 35 / 500, y: 155 / 500, w: 30 / 500, h: 30 / 500 });
  assert.ok(result[0].text.includes('ABCDE') && result[1].text.includes('ABCDE'), 'on both pages');
  assert.ok(result[0].text.includes('Nantes'));
  assert.equal(result[0].ink, 0, 'the box holds no check mark');
  const fields = (await PDFDocument.load(await downloaded())).getForm().getFields();
  assert.equal(fields.length, 0);
  await page.close();
});
