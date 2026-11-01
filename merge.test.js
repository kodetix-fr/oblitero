import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { countPages, mergePdfs, moveItem } from './merge.js';

async function makePdf(sizes) {
  const document = await PDFDocument.create();
  for (const size of sizes) document.addPage([size, size]);
  return document.save();
}

test('mergePdfs keeps every page, in the order of the sources', async () => {
  const merged = await mergePdfs([await makePdf([100]), await makePdf([200, 300])]);
  const document = await PDFDocument.load(merged);
  assert.deepEqual(document.getPages().map((page) => page.getWidth()), [100, 200, 300]);
});

test('mergePdfs refuses fewer than two sources', async () => {
  await assert.rejects(mergePdfs([await makePdf([100])]), /at least two/);
  await assert.rejects(mergePdfs([]), /at least two/);
});

test('countPages counts the pages and rejects bytes that are not a PDF', async () => {
  assert.equal(await countPages(await makePdf([100, 100, 100])), 3);
  await assert.rejects(countPages(new Uint8Array([1, 2, 3])));
});

test('moveItem moves one item and leaves the input untouched', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(list, 2, 1), ['a', 'c', 'b']);
  assert.deepEqual(list, ['a', 'b', 'c']);
});

test('moveItem ignores positions outside the list', () => {
  const list = ['a', 'b'];
  assert.equal(moveItem(list, 0, 2), list);
  assert.equal(moveItem(list, -1, 0), list);
  assert.equal(moveItem(list, 1, 1), list);
});
