import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { countPages } from './merge.js';

async function makePdf(sizes) {
  const document = await PDFDocument.create();
  for (const size of sizes) document.addPage([size, size]);
  return document.save();
}

test('countPages counts the pages and rejects bytes that are not a PDF', async () => {
  assert.equal(await countPages(await makePdf([100, 100, 100])), 3);
  await assert.rejects(countPages(new Uint8Array([1, 2, 3])));
});
