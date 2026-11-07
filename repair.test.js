import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { rebuildPdf } from './repair.js';

async function forty(useObjectStreams) {
  const document = await PDFDocument.create();
  for (let i = 0; i < 40; i++) document.addPage([200 + i, 300]).drawText(`page ${i + 1}`, { x: 20, y: 20, size: 12 });
  return document.save({ useObjectStreams });
}

// pdf-lib says on the console what it skips; the tests do not need to hear it.
async function quietly(work) {
  const { log, warn } = console;
  console.log = console.warn = () => {};
  try {
    return await work();
  } finally {
    Object.assign(console, { log, warn });
  }
}

test('a file cut short keeps the pages that are whole, in their order, and says how many it had', async () => {
  const bytes = await forty(false);
  const result = await quietly(() => rebuildPdf(bytes.slice(0, Math.floor(bytes.length * 0.6))));
  assert.equal(result.declared, 40);
  assert.ok(result.pages > 10 && result.pages < 40, String(result.pages));
  const rebuilt = await PDFDocument.load(result.bytes);
  assert.equal(rebuilt.getPageCount(), result.pages);
  assert.deepEqual(rebuilt.getPages().slice(0, 3).map((page) => page.getWidth()), [200, 201, 202]);
});

test('a file whose cross-reference table is wrong keeps every page; a file with no object is refused', async () => {
  const bytes = await forty(false);
  const text = Buffer.from(bytes).toString('latin1').replace(/startxref\s+\d+/, 'startxref\n7');
  const result = await quietly(() => rebuildPdf(Buffer.from(text, 'latin1')));
  assert.deepEqual([result.pages, result.declared], [40, 40]);
  const streamed = await forty(true);
  const cut = await quietly(() => rebuildPdf(streamed.slice(0, Math.floor(streamed.length * 0.9))));
  assert.ok(cut.pages >= 1 && cut.pages < 40);
  await assert.rejects(rebuildPdf(new TextEncoder().encode('%PDF-1.7\nnothing here')));
});
