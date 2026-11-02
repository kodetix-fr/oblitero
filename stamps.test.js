import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from './vendor/pdf-lib.esm.min.js';
import { NO_STAMPS, anchor, applyStamps, bandText, checkText, label, toPage } from './stamps.js';

test('label writes a number in the three formats', () => {
  assert.deepEqual([label('number', 3, 12), label('of', 3, 12), label('page', 3, 12)], ['3', '3 / 12', 'Page 3']);
});

test('toPage turns a displayed point into the space of the stored page, for each rotation', () => {
  assert.deepEqual(toPage(0, 200, 100, 10, 20), { x: 10, y: 20 });
  assert.deepEqual(toPage(90, 200, 100, 10, 20), { x: 180, y: 10 });
  assert.deepEqual(toPage(180, 200, 100, 10, 20), { x: 190, y: 80 });
  assert.deepEqual(toPage(270, 200, 100, 10, 20), { x: 20, y: 90 });
  assert.deepEqual(toPage(-90, 200, 100, 10, 20), toPage(270, 200, 100, 10, 20));
});

test('anchor puts the text in a corner or in the middle of an edge, inside the margin', () => {
  assert.deepEqual(anchor('bottom-left', 600, 800, 30, 10), { x: 28, y: 28 });
  assert.deepEqual(anchor('top-right', 600, 800, 30, 10), { x: 542, y: 762 });
  assert.deepEqual(anchor('bottom-center', 600, 800, 30, 10), { x: 285, y: 28 });
});

test('applyStamps draws on every page, rotated ones included, and checkText refuses what Helvetica cannot draw', async () => {
  const document = await PDFDocument.create();
  for (const size of [300, 400, 500]) document.addPage([size, size]);
  document.getPage(1).setRotation(degrees(90));
  const before = document.getPages().map((page) => page.node.Contents()?.toString() ?? '');
  await applyStamps(document, {
    numbers: { position: 'bottom-center', format: 'of', first: 1, size: 10, skipFirst: true },
    watermark: { text: 'DRAFT', size: 40, opacity: 0.3, angle: 45 },
  });
  const after = await PDFDocument.load(await document.save());
  assert.equal(after.getPageCount(), 3);
  assert.notDeepEqual(after.getPages().map((page) => page.node.Contents()?.toString() ?? ''), before);
  await checkText('Draft 12 / 30');
  await assert.rejects(checkText('日本語'), /cannot draw/);
  const none = await PDFDocument.create();
  none.addPage([100, 100]);
  await applyStamps(none, { numbers: null, watermark: null });
  assert.equal(none.getPage(0).node.Contents(), undefined);
});

test('bandText puts the page number and the page count into a header or a footer', () => {
  assert.equal(bandText('Contract, page {page} of {pages}', 3, 12), 'Contract, page 3 of 12');
  assert.equal(bandText('{page}/{pages} {page}', 2, 5), '2/5 2');
  assert.equal(bandText('No token', 2, 5), 'No token');
});

test('a header and a footer are drawn only on the pages of the range', async () => {
  const draw = async (settings) => {
    const document = await PDFDocument.create();
    for (let i = 0; i < 4; i++) document.addPage([300, 300]);
    await applyStamps(document, { ...NO_STAMPS, ...settings });
    return (await PDFDocument.load(await document.save())).getPages().map((page) => page.node.Contents() !== undefined);
  };
  assert.deepEqual(await draw({ header: { text: 'H {page}', align: 'left', size: 10 } }), [true, true, true, true]);
  assert.deepEqual(await draw({ header: { text: 'H {page}', align: 'left', size: 10 }, range: '2-3' }), [false, true, true, false]);
  assert.deepEqual(await draw({ footer: { text: 'F', align: 'right', size: 10 }, range: '4-' }), [false, false, false, true]);
  assert.deepEqual(await draw({ numbers: { position: 'top-left', format: 'number', first: 1, size: 10, skipFirst: false }, range: '1, 3' }), [true, false, true, false]);
  assert.deepEqual(await draw({}), [false, false, false, false]);
});
