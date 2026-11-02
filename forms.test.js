import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from './vendor/pdf-lib.esm.min.js';
import { fillForm, readFields } from './forms.js';

async function makeForm() {
  const document = await PDFDocument.create();
  const first = document.addPage([400, 400]);
  const second = document.addPage([400, 400]);
  const form = document.getForm();
  const name = form.createTextField('nom');
  name.setText('Existing');
  name.addToPage(first, { x: 20, y: 340, width: 200, height: 22 });
  const notes = form.createTextField('remarques');
  notes.enableMultiline();
  notes.setMaxLength(60);
  notes.addToPage(first, { x: 20, y: 280, width: 200, height: 50 });
  notes.acroField.setDefaultAppearance(notes.acroField.getDefaultAppearance().replace(/ \d+ Tf/, ' 0 Tf'));
  form.createCheckBox('accepte').addToPage(first, { x: 20, y: 240, width: 18, height: 18 });
  const radio = form.createRadioGroup('civilite');
  radio.addOptionToPage('M', first, { x: 20, y: 200, width: 16, height: 16 });
  radio.addOptionToPage('Mme', first, { x: 60, y: 200, width: 16, height: 16 });
  const country = form.createDropdown('pays');
  country.addOptions(['France', 'Japon']);
  country.addToPage(second, { x: 20, y: 340, width: 150, height: 22 });
  const language = form.createOptionList('langue');
  language.addOptions(['Français', 'English']);
  language.addToPage(second, { x: 20, y: 260, width: 150, height: 60 });
  form.createButton('envoyer').addToPage('Send', second, { x: 20, y: 200, width: 80, height: 24 });
  form.createTextField('verrouille').addToPage(second, { x: 200, y: 340, width: 100, height: 22 });
  form.getTextField('verrouille').enableReadOnly();
  return document.save({ updateFieldAppearances: false });
}

// Everything the content streams of a document draw, as text.
function drawn(document) {
  let all = '';
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) all += Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
    else if (typeof object.getUnencodedContents === 'function') all += Buffer.from(object.getUnencodedContents()).toString('latin1');
  }
  return all;
}
// The pages copied into a new document, as the export does: only what the pages reach is kept.
async function exported(bytes) {
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page);
  return PDFDocument.load(await output.save());
}
const hex = (text) => Buffer.from(text, 'latin1').toString('hex').toUpperCase();
const has = (document, text) => drawn(document).includes(hex(text)) || drawn(document).includes(`(${text})`);

test('readFields lists the fields in order, with their kind, value, options and pages', async () => {
  const fields = readFields(await PDFDocument.load(await makeForm()));
  assert.deepEqual(fields.map((field) => [field.name, field.type, field.pages]), [
    ['nom', 'text', [0]],
    ['remarques', 'text', [0]],
    ['accepte', 'checkbox', [0]],
    ['civilite', 'radio', [0]],
    ['pays', 'dropdown', [1]],
    ['langue', 'list', [1]],
    ['envoyer', 'unsupported', [1]],
    ['verrouille', 'text', [1]],
  ]);
  const byName = Object.fromEntries(fields.map((field) => [field.name, field]));
  assert.equal(byName.nom.value, 'Existing');
  assert.deepEqual([byName.remarques.multiline, byName.remarques.maxLength, byName.nom.multiline], [true, 60, false]);
  assert.equal(byName.accepte.value, false);
  assert.deepEqual(byName.civilite.options, ['M', 'Mme']);
  assert.deepEqual([byName.pays.options, byName.pays.editable, byName.langue.options], [['France', 'Japon'], false, ['Français', 'English']]);
  assert.deepEqual([byName.verrouille.readOnly, byName.nom.readOnly], [true, false]);
});

test('a PDF without a form has no field', async () => {
  const plain = await PDFDocument.create();
  plain.addPage();
  assert.deepEqual(readFields(plain), []);
});

test('fillForm writes the values into the pages and leaves no field, no widget and no form', async () => {
  const output = await fillForm(await makeForm(), { nom: 'ZZ-NOM', remarques: 'ZZ-NOTES', accepte: true, civilite: 'Mme', pays: 'Japon', langue: 'English', verrouille: 'ZZ-LOCKED' });
  assert.deepEqual(readFields(await PDFDocument.load(output)), []);
  const document = await exported(output);
  assert.equal(document.getPageCount(), 2);
  for (const page of document.getPages()) assert.equal(page.node.Annots()?.size() ?? 0, 0);
  for (const value of ['ZZ-NOM', 'ZZ-NOTES', 'Japon', 'English']) assert.ok(has(document, value), `${value} is drawn`);
  assert.ok(!has(document, 'ZZ-LOCKED'), 'a read only field keeps its own value');
  assert.ok(drawn(document).includes('/Helvetica 10 Tf'), 'a multiline field with no size of its own is written small');
});

test('fillForm with nothing to change keeps what the fields already hold, and an empty text clears a field', async () => {
  const kept = await exported(await fillForm(await makeForm(), {}));
  assert.ok(has(kept, 'Existing'));
  const cleared = await exported(await fillForm(await makeForm(), { nom: '' }));
  assert.ok(!has(cleared, 'Existing'));
});

test('fillForm refuses a text that is too long, and one the standard font cannot draw', async () => {
  await assert.rejects(fillForm(await makeForm(), { remarques: 'x'.repeat(61) }));
  await assert.rejects(fillForm(await makeForm(), { nom: '日本語' }));
});
