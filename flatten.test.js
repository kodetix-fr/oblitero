import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, rgb } from './vendor/pdf-lib.esm.min.js';
import { flattenAnnotations, placement } from './flatten.js';

test('an appearance is put on its rectangle through its own matrix', () => {
  assert.deepEqual(placement([10, 20, 110, 70], [0, 0, 100, 50]), [1, 0, 0, 1, 10, 20]);
  assert.deepEqual(placement([10, 20, 60, 45], [0, 0, 100, 50]), [0.5, 0, 0, 0.5, 10, 20]);
  assert.deepEqual(placement([0, 0, 50, 100], [0, 0, 100, 50], [0, 1, -1, 0, 0, 0]), [1, 0, 0, 1, 50, 0]);
});

test('fields and comments become content of the page and no annotation is left but the links', async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 300]);
  const field = document.getForm().createTextField('name');
  field.setText('Ada');
  field.addToPage(page, { x: 20, y: 200, width: 150, height: 30 });
  const box = document.getForm().createCheckBox('agree');
  box.addToPage(page, { x: 20, y: 150, width: 20, height: 20 });
  box.check();
  const look = document.context.register(document.context.formXObject([], { BBox: [0, 0, 50, 50] }));
  const note = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [100, 100, 150, 150], AP: { N: look }, CA: 0.5 }));
  const hidden = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], F: 2, AP: { N: look } }));
  const link = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10] }));
  page.node.addAnnot(note);
  page.node.addAnnot(hidden);
  page.node.addAnnot(link);
  page.drawText('base', { x: 10, y: 10, size: 10, color: rgb(0, 0, 0) });

  flattenAnnotations(document);
  const annotations = page.node.Annots();
  assert.equal(annotations.size(), 1);
  assert.equal(annotations.lookup(0).get(PDFName.of('Subtype')), PDFName.of('Link'));
  const drawn = [...page.node.normalizedEntries().XObject.keys()].map(String);
  assert.equal(drawn.length, 3);
  assert.equal(page.node.normalizedEntries().ExtGState.keys().length, 1);
  await PDFDocument.load(await document.save());
});
