import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFString } from './vendor/pdf-lib.esm.min.js';
import { DEFAULT_PROPERTIES, applyProperties, inspectPdf } from './properties.js';
import { buildPdf } from './export.js';
import { createPages } from './pages-model.js';

async function loaded() {
  const document = await PDFDocument.create();
  document.setTitle('Quarterly report');
  document.setAuthor('Jean Dupont');
  document.setKeywords(['alpha', 'beta']);
  const first = document.addPage([300, 300]);
  document.addPage([300, 300]);
  await document.attach(new TextEncoder().encode('private note'), 'note.txt', { mimeType: 'text/plain' });
  const link = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 100, 40], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org') } }));
  const note = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 60, 30, 80], Contents: PDFString.of('a private comment') }));
  first.node.set(PDFName.of('Annots'), document.context.obj([link, note]));
  document.getForm().createTextField('name').addToPage(document.getPage(1), { x: 10, y: 10, width: 100, height: 20 });
  return document.save();
}

test('inspectPdf reports what a PDF carries besides its pages', async () => {
  const report = await inspectPdf(await loaded());
  assert.equal(report.pages, 2);
  assert.deepEqual([report.title, report.author, report.keywords], ['Quarterly report', 'Jean Dupont', 'alpha beta']);
  assert.deepEqual(report.files, ['note.txt']);
  assert.deepEqual(report.annotations, { links: 1, widgets: 1, others: 1 });
  assert.equal(report.fields, 1);
  assert.deepEqual([report.xmp, report.bookmarks, report.layers, report.scripts], [false, false, false, 0]);
  assert.ok(report.created instanceof Date);
});

test('the output is a new document that carries none of the document level data, and only what the user writes', async () => {
  const source = await loaded();
  const clean = await PDFDocument.load(await buildPdf([source], createPages(2), () => {}), { updateMetadata: false });
  assert.equal(clean.getTitle(), undefined);
  assert.equal(clean.getAuthor(), undefined);
  assert.deepEqual((await inspectPdf(await clean.save())).files, []);

  const written = await PDFDocument.load(
    await buildPdf([source], createPages(2), () => {}, async (output) =>
      applyProperties(output, { ...DEFAULT_PROPERTIES, title: 'Clean title', keywords: ' one, two ,, ', dates: false, stripAnnotations: true }),
    ),
    { updateMetadata: false },
  );
  assert.equal(written.getTitle(), 'Clean title');
  assert.equal(written.getKeywords(), 'one two');
  assert.equal(written.getCreationDate(), undefined);
  assert.equal(written.getModificationDate(), undefined);
  assert.equal(written.getProducer(), 'Oblitero');
  assert.deepEqual((await inspectPdf(await written.save())).annotations, { links: 0, widgets: 0, others: 0 });
});

test('the links and comments of a copied page stay in the output unless the user strips them', async () => {
  const kept = await inspectPdf(await buildPdf([await loaded()], createPages(2), () => {}));
  assert.equal(kept.annotations.links, 1);
  assert.equal(kept.annotations.others, 1);
});
