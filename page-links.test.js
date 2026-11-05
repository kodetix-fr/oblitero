import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, StandardFonts } from './vendor/pdf-lib.esm.min.js';
import { buildPdf } from './export.js';
import { compressPdf } from './compress.js';
import { DEFAULT_PROPERTIES, applyProperties } from './properties.js';
import { createPages } from './pages-model.js';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 1, 0, 1, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const burn = async () => ({ bytes: JPEG, width: 200, height: 200 });
const SECRET_HEX = Buffer.from('SECRET').toString('hex').toUpperCase();
const name = (value) => PDFName.of(value);

// Two pages, the second holding SECRET; `tie` connects the first page to the second.
async function source(tie) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([200, 200]);
  const second = document.addPage([200, 200]);
  first.drawText('TOC', { x: 10, y: 10, font, size: 12 });
  second.drawText('SECRET', { x: 10, y: 10, font, size: 12 });
  const annotations = tie?.(document, first, second) ?? [];
  if (annotations.length) first.node.set(name('Annots'), document.context.obj(annotations.map((annotation) => document.context.register(document.context.obj(annotation)))));
  return document.save();
}

async function scan(bytes) {
  const output = await PDFDocument.load(bytes);
  let pageObjects = 0;
  let found = false;
  for (const [, object] of output.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && String(object.get(name('Type'))) === '/Page') pageObjects++;
    if (object instanceof PDFRawStream) {
      let content = object.contents;
      try {
        content = inflateSync(content);
      } catch {
        content = object.contents;
      }
      if (Buffer.from(content).toString('latin1').toUpperCase().includes(SECRET_HEX)) found = true;
    }
  }
  return { listed: output.getPageCount(), pageObjects, found };
}

const pages = createPages(2);
const redacted = [pages[0], { ...pages[1], redactions: [{ x: 0, y: 0, w: 1, h: 1 }] }];
const annotationsOf = async (bytes) => {
  const list = (await PDFDocument.load(bytes)).getPage(0).node.Annots();
  return Array.from({ length: list?.size() ?? 0 }, (_, i) => list.lookup(i, PDFDict));
};

const TIES = {
  'a link with a destination': (_, __, second) => [{ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], Dest: [second.ref, 'Fit'] }],
  'a link with a go-to action': (_, __, second) => [{ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], A: { S: 'GoTo', D: [second.ref, 'Fit'] } }],
  'a web link followed by a go-to': (_, __, second) => [{ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], A: { S: 'URI', URI: PDFString.of('https://example.org/'), Next: { S: 'GoTo', D: [second.ref, 'Fit'] } } }],
  'the owner page of a note': (_, __, second) => [{ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 50, 50], P: second.ref }],
  'an unknown key of a note': (_, __, second) => [{ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 50, 50], Custom: { Deep: [second.ref] } }],
  'a widget whose field has a widget on the page': (document, _, second) => {
    const parent = document.context.register(document.context.obj({ T: PDFString.of('group'), Kids: [document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Widget', P: second.ref }))] }));
    return [{ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', Rect: [0, 0, 50, 50], Parent: parent }];
  },
  'a page action': (document, first, second) => {
    first.node.set(name('AA'), document.context.obj({ O: { S: 'GoTo', D: [second.ref, 'Fit'] } }));
  },
  'an article bead': (document, first, second) => {
    first.node.set(name('B'), document.context.obj([{ T: { P: second.ref } }]));
  },
};

for (const [label, tie] of Object.entries(TIES)) {
  test(`${label} does not carry a redacted or hidden page into the output`, async () => {
    const bytes = await source(tie);
    const outcomes = {
      redacted: await buildPdf([bytes], redacted, burn),
      hidden: await buildPdf([bytes], [pages[0]], burn),
      stripped: await buildPdf([bytes], redacted, burn, (output) => applyProperties(output, { ...DEFAULT_PROPERTIES, stripAnnotations: true })),
      compressed: await compressPdf(await buildPdf([bytes], redacted, burn), 'light', async () => null),
    };
    for (const [how, output] of Object.entries(outcomes)) {
      const { listed, pageObjects, found } = await scan(output);
      assert.equal(pageObjects, listed, `${how}: a page object is not in the page tree`);
      assert.equal(found, false, `${how}: the text of the page is still in the file`);
    }
  });
}

test('a redaction keeps nothing of a form field that sits on the redacted page', async () => {
  const document = await PDFDocument.create();
  const first = document.addPage([200, 200]);
  const second = document.addPage([200, 200]);
  const form = document.getForm();
  const shown = form.createTextField('person.city');
  shown.setText('Paris');
  shown.addToPage(first, { x: 10, y: 10, width: 100, height: 20 });
  const hiddenField = form.createTextField('person.secret');
  const secretValue = 'FIELD-VALUE-TO-HIDE';
  hiddenField.setText(secretValue);
  hiddenField.addToPage(second, { x: 10, y: 10, width: 100, height: 20 });
  const output = await buildPdf([await document.save({ useObjectStreams: false })], redacted, burn);
  assert.equal(Buffer.from(output).includes(secretValue), false);
  const loaded = await PDFDocument.load(output);
  for (const [, object] of loaded.context.enumerateIndirectObjects()) {
    assert.equal(String(object).includes(secretValue), false, 'the value of the field is in an object of the output');
    if (object instanceof PDFRawStream) {
      let content = object.contents;
      try {
        content = inflateSync(content);
      } catch {
        content = object.contents;
      }
      assert.equal(Buffer.from(content).toString('latin1').includes(secretValue), false, 'the value of the field is in a stream of the output');
    }
  }
  assert.equal(String((await annotationsOf(output))[0].get(name('Subtype'))), '/Widget', 'the widget of the kept page stays');
});

test('what a page shows stays: a web link, a note, and the appearance of a widget', async () => {
  const bytes = await source(() => [
    { Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], A: { S: 'URI', URI: PDFString.of('https://example.org/') } },
    { Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 50, 50], Contents: PDFString.of('A note') },
  ]);
  const [link, note] = await annotationsOf(await buildPdf([bytes], [pages[0]], burn));
  assert.equal(String(link.lookup(name('A'), PDFDict).get(name('S'))), '/URI');
  assert.equal(String(note.get(name('Subtype'))), '/Text');
});

test('building twice from the same bytes gives the same pages', async () => {
  const bytes = await source(TIES['a link with a destination']);
  for (let i = 0; i < 2; i++) assert.equal((await PDFDocument.load(await buildPdf([bytes], createPages(2), burn))).getPageCount(), 2);
});

const MARKER = 'IMAGE-OF-THE-OTHER-PAGE';
const hasMarker = (bytes, marker = MARKER) => Buffer.from(bytes).includes(marker);

// Each page draws its own picture; then one dictionary holds both, on the page tree or on every page.
async function sharedResources(where) {
  const document = await PDFDocument.create();
  const kept = await document.embedJpg(JPEG);
  const other = await document.embedJpg(Uint8Array.from([...JPEG, ...Buffer.from(MARKER)]));
  document.addPage([200, 200]).drawImage(kept, { x: 0, y: 0, width: 10, height: 10 });
  document.addPage([200, 200]).drawImage(other, { x: 0, y: 0, width: 10, height: 10 });
  const loaded = await PDFDocument.load(await document.save({ useObjectStreams: false }));
  const nodes = loaded.getPages().map((page) => page.node);
  const merged = loaded.context.obj({});
  const images = loaded.context.obj({});
  for (const node of nodes) {
    const own = node.lookup(name('Resources'), PDFDict).lookup(name('XObject'), PDFDict);
    for (const [key, value] of own.entries()) images.set(key, value);
    node.delete(name('Resources'));
  }
  merged.set(name('XObject'), images);
  const shared = loaded.context.register(merged);
  if (where === 'tree') loaded.catalog.Pages().set(name('Resources'), shared);
  else for (const node of nodes) node.set(name('Resources'), shared);
  return loaded.save({ useObjectStreams: false });
}

for (const where of ['tree', 'pages']) {
  test(`a dictionary of resources shared on the ${where} brings nothing of the other page`, async () => {
    const bytes = await sharedResources(where);
    assert.equal(hasMarker(bytes), true);
    const hidden = await buildPdf([bytes], [pages[0]], burn);
    assert.equal(hasMarker(hidden), false);
    assert.equal(hasMarker(await buildPdf([bytes], redacted, burn)), false);
    const whole = await buildPdf([bytes], createPages(2), burn);
    assert.equal(hasMarker(whole), true, 'a page keeps what it draws');
    const drawn = (await PDFDocument.load(hidden)).getPage(0).node.lookup(name('Resources'), PDFDict).lookup(name('XObject'), PDFDict);
    assert.equal(drawn.keys().length, 1, 'a page keeps what it draws');
  });
}

test('private data of a page, attachments and notes that lead elsewhere stay behind', async () => {
  const secretNote = 'NOTE-OF-THE-OTHER-PAGE';
  const bytes = await source((document, first, second) => {
    second.node.set(name('Annots'), document.context.obj([document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 9, 9], Contents: PDFString.of(secretNote), P: second.ref }))]));
    first.node.set(name('PieceInfo'), document.context.obj({ App: { Private: PDFString.of('PRIVATE-DATA') } }));
    first.node.set(name('Thumb'), document.context.register(document.context.stream('THUMB-DATA')));
    const popup = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Popup', Parent: second.node.Annots().get(0), Rect: [0, 0, 9, 9] }));
    return [
      { Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 9, 9], Popup: popup, Contents: PDFString.of('Kept note') },
      { Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 9, 9], FS: PDFString.of('ATTACHED-FILE') },
      { Type: 'Annot', Rect: [0, 0, 9, 9], Parent: second.node.Annots().get(0) },
    ];
  });
  const output = await buildPdf([bytes], [pages[0]], burn);
  const objects = (await PDFDocument.load(output)).context.enumerateIndirectObjects().map(([, object]) => String(object)).join('\n');
  for (const secret of [secretNote, 'PRIVATE-DATA', 'ATTACHED-FILE']) assert.equal(objects.includes(secret), false, secret);
  assert.equal(hasMarker(output, 'THUMB-DATA'), false);
  const left = await annotationsOf(output);
  assert.equal(left.length, 1);
  assert.equal(left[0].has(name('Popup')), false);
});

test('an appearance cannot point at the content of another page', async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([200, 200]);
  const second = document.addPage([200, 200]);
  second.drawText('SECRET', { x: 10, y: 10, font, size: 12 });
  const loaded = await PDFDocument.load(await document.save({ useObjectStreams: false }));
  const [kept, other] = loaded.getPages();
  const content = other.node.get(name('Contents'));
  const target = content instanceof PDFArray ? content.get(0) : content;
  kept.node.set(name('Annots'), loaded.context.obj([loaded.context.register(loaded.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [0, 0, 9, 9], AP: { N: target } }))]));
  assert.ok(first);
  const { found } = await scan(await buildPdf([await loaded.save()], [pages[0]], burn));
  assert.equal(found, false);
});

test('stripping the annotations leaves nothing of them in the file', async () => {
  const note = 'NOTE-TO-STRIP';
  const bytes = await source(() => [{ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 9, 9], Contents: PDFString.of(note) }]);
  const output = await buildPdf([bytes], createPages(2), burn, (document) => applyProperties(document, { ...DEFAULT_PROPERTIES, stripAnnotations: true }));
  const objects = (await PDFDocument.load(output)).context.enumerateIndirectObjects().map(([, object]) => String(object)).join('\n');
  assert.equal(objects.includes(note), false);
});
