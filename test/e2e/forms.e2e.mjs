import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFString, StandardFonts } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
let page;
let path;
before(async () => {
  app = await launchExtension();
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([500, 500]);
  const second = document.addPage([500, 500]);
  first.drawText('FORM-PAGE-ONE', { x: 20, y: 470, size: 14, font });
  const form = document.getForm();
  const name = form.createTextField('identite.nom');
  name.addToPage(first, { x: 20, y: 420, width: 250, height: 24 });
  name.acroField.dict.set(PDFName.of('TU'), PDFString.of('Nom et prénom'));
  const notes = form.createTextField('remarques');
  notes.enableMultiline();
  notes.addToPage(first, { x: 20, y: 340, width: 250, height: 60 });
  notes.setFontSize(11);
  form.createCheckBox('accepte').addToPage(first, { x: 20, y: 300, width: 20, height: 20 });
  const civility = form.createRadioGroup('civilite');
  civility.addOptionToPage('M', first, { x: 20, y: 260, width: 16, height: 16 });
  civility.addOptionToPage('Mme', first, { x: 80, y: 260, width: 16, height: 16 });
  const country = form.createDropdown('pays');
  country.addOptions(['France', 'Japon']);
  country.addToPage(second, { x: 20, y: 420, width: 150, height: 24 });
  const language = form.createOptionList('langue');
  language.addOptions(['Français', 'English']);
  language.addToPage(second, { x: 20, y: 340, width: 150, height: 60 });
  const locked = form.createTextField('reference');
  locked.setText('REF-LOCKED');
  locked.enableReadOnly();
  locked.addToPage(second, { x: 20, y: 300, width: 150, height: 24 });
  form.createButton('envoyer').addToPage('Send', second, { x: 20, y: 250, width: 80, height: 24 });
  path = join(app.dir, 'formulaire.pdf');
  writeFileSync(path, await document.save());
  page = await app.openApp();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(1).waitFor();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

async function downloaded() {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  return readFileSync(await download.path());
}

// The text of every page of a PDF, read by the reader of the extension, and the number of fields left in it.
async function inspect(bytes) {
  const fields = (await PDFDocument.load(bytes)).getForm().getFields().length;
  const pages = await page.evaluate(async (bytes) => {
    const { openRender } = await import('./render.js');
    const doc = await openRender(new Uint8Array(bytes));
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((item) => item.str).join(' '));
    return out;
  }, Array.from(bytes));
  return { fields, pages };
}

const row = (label) => page.locator('#form-fields .form-row').filter({ has: page.locator('.form-label', { hasText: label }) });

test('the fields are listed in order, with a readable name, their page, and what cannot be filled', async () => {
  assert.equal(await page.locator('#fill-form').isDisabled(), false);
  await page.locator('#fill-form').click();
  await page.locator('#form-dialog').waitFor({ state: 'visible' });
  assert.deepEqual(await page.locator('#form-fields .form-label').allInnerTexts(), ['Nom et prénom', 'remarques', 'accepte', 'civilite', 'pays', 'langue', 'reference']);
  assert.deepEqual(await page.locator('#form-fields .form-meta').allInnerTexts(), ['Page 1', 'Page 1', 'Page 1', 'Page 1', 'Page 2', 'Page 2', 'Page 2, read only']);
  assert.equal(await page.locator('#form-fields .form-note').innerText(), 'envoyer: cannot be filled here (button or signature)');
  assert.equal(await page.locator('#form-fields h3').innerText(), 'formulaire.pdf');
  assert.equal(await row('reference').locator('input').isDisabled(), true);
  assert.equal(await row('reference').locator('input').inputValue(), 'REF-LOCKED');
  assert.deepEqual(await row('civilite').locator('option').allInnerTexts(), ['(none)', 'M', 'Mme']);
  await page.locator('#form-cancel').click();
  await page.locator('#form-dialog').waitFor({ state: 'hidden' });
});

test('a character the standard font cannot draw is refused, and the dialog stays open', async () => {
  await page.locator('#fill-form').click();
  await row('Nom et prénom').locator('input').fill('日本語');
  await page.locator('#form-apply').click();
  await page.waitForFunction(() => document.getElementById('form-error').textContent.includes('Nom et prénom'));
  assert.equal(await page.locator('#form-dialog').isVisible(), true);
  await page.locator('#form-cancel').click();
  await page.locator('#form-dialog').waitFor({ state: 'hidden' });
});

test('every kind of field is filled, shown on the thumbnails, written on the pages, and no field is left', async () => {
  await page.locator('#fill-form').click();
  await row('Nom et prénom').locator('input').fill('Jean Dupont');
  await row('remarques').locator('textarea').fill('ligne un\nligne deux');
  await row('accepte').locator('input').check();
  await row('civilite').locator('select').selectOption('Mme');
  await row('pays').locator('select').selectOption('Japon');
  await row('langue').locator('select').selectOption('English');
  await page.locator('#form-apply').click();
  await page.locator('#form-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.startsWith('The form is filled'));

  const { fields, pages } = await inspect(await downloaded());
  assert.equal(fields, 0);
  assert.match(pages[0], /FORM-PAGE-ONE/);
  for (const text of ['Jean Dupont', 'ligne un', 'ligne deux']) assert.ok(pages[0].includes(text), `${text} on page 1: ${pages[0]}`);
  for (const text of ['Japon', 'English', 'REF-LOCKED']) assert.ok(pages[1].includes(text), `${text} on page 2: ${pages[1]}`);
  assert.ok(!pages[1].includes('France'), 'the other option is not drawn');

  const ink = async (index) =>
    page.evaluate(async ({ index }) => {
      const canvas = document.querySelectorAll('#grid canvas')[index];
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 300) dark++;
      return dark;
    }, { index });
  assert.ok((await ink(0)) > 200, 'the thumbnail of page 1 shows the values');
});

test('the dialog shows the values again, Reset goes back to the file, and an emptied form leaves nothing', async () => {
  await page.locator('#fill-form').click();
  assert.equal(await row('Nom et prénom').locator('input').inputValue(), 'Jean Dupont');
  assert.equal(await row('accepte').locator('input').isChecked(), true);
  assert.equal(await row('civilite').locator('select').inputValue(), 'Mme');
  assert.equal(await row('pays').locator('select').inputValue(), 'Japon');
  await page.locator('#form-reset').click();
  assert.equal(await row('Nom et prénom').locator('input').inputValue(), '');
  assert.equal(await row('accepte').locator('input').isChecked(), false);
  assert.equal(await row('civilite').locator('select').inputValue(), '');
  await page.locator('#form-apply').click();
  await page.locator('#form-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.startsWith('The form is filled'));
  const { fields, pages } = await inspect(await downloaded());
  assert.equal(fields, 0);
  assert.ok(!pages[0].includes('Jean Dupont') && !pages[1].includes('Japon'), 'nothing of the first values is left');
});

test('a form can be filled again, and the Properties report still sees the fields of the file', async () => {
  await page.locator('#fill-form').click();
  await row('Nom et prénom').locator('input').fill('Marie Curie');
  await page.locator('#form-apply').click();
  await page.locator('#form-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('pages-status').textContent.startsWith('The form is filled'));
  assert.ok((await inspect(await downloaded())).pages[0].includes('Marie Curie'));

  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#props-report').innerText(), /Form fields\s+8 fields/);
  await page.keyboard.press('Escape');
});

test('a file without a form has nothing to fill, until a file with a form is added', async () => {
  const other = await app.openApp();
  await other.setInputFiles('#pages-file', await writePdf(app.dir, 'plain.pdf', [{ size: 100, text: 'A' }]));
  await other.locator('#grid li').first().waitFor();
  assert.equal(await other.locator('#fill-form').isDisabled(), true);
  assert.equal(await other.locator('#fill-form').getAttribute('title'), 'There is no form field in these files. To write on a page, use Add text.');
  await other.setInputFiles('#pages-file', path);
  await other.locator('#grid li').nth(2).waitFor();
  assert.equal(await other.locator('#fill-form').isDisabled(), false);
  await other.close();
});
