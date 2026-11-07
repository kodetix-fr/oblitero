import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFArray, PDFDict, PDFDocument, PDFName } from './vendor/pdf-lib.esm.min.js';
import { outlineFor, writeOutline } from './outline.js';
import { createPages } from './pages-model.js';

const item = (title, page, items = []) => ({ title, page, items });
const strip = (tree) => tree.map(({ title, page, items }) => [title, page, strip(items)]);

// The first file has chapters on its pages 0 and 2, a section on page 1 and a broken entry; the second has one on page 1.
const trees = [[item('One', 0, [item('One.1', 1)]), item('Two', 2), item('Broken', null)], [item('Annex', 1)]];
const names = ['report.pdf', 'annex.pdf'];

test('the outline of two files goes under an entry for each file, shifted to the output pages', () => {
  const entries = [...createPages(3, { file: 0 }), ...createPages(2, { file: 1, firstId: 3 })];
  assert.deepEqual(strip(outlineFor(entries, trees, names)), [
    ['report.pdf', 0, [['One', 0, [['One.1', 1, []]]], ['Two', 2, []]]],
    ['annex.pdf', 3, [['Annex', 4, []]]],
  ]);
});

test('an entry whose page is left out is dropped and its entries move up; a single file has no file entry', () => {
  const entries = createPages(3, { file: 0 }).filter((page) => page.source !== 0);
  assert.deepEqual(strip(outlineFor(entries, trees, names)), [['One.1', 0, []], ['Two', 1, []]]);
  assert.deepEqual(outlineFor(createPages(2, { file: 2 }), trees, names), []);
});

test('the outline is written as linked entries that point to the output pages', async () => {
  const output = await PDFDocument.create();
  for (let i = 0; i < 5; i++) output.addPage([100, 100]);
  const entries = [...createPages(3, { file: 0 }), ...createPages(2, { file: 1, firstId: 3 })];
  writeOutline(output, outlineFor(entries, trees, names));
  const reloaded = await PDFDocument.load(await output.save());
  const outlines = reloaded.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  const walk = (dict) => {
    const found = [];
    for (let entry = dict.lookupMaybe(PDFName.of('First'), PDFDict); entry; entry = entry.lookupMaybe(PDFName.of('Next'), PDFDict)) {
      const target = entry.lookup(PDFName.of('Dest'), PDFArray).get(0);
      found.push([entry.lookup(PDFName.of('Title')).decodeText(), reloaded.getPages().findIndex((page) => page.ref === target), walk(entry)]);
    }
    return found;
  };
  assert.deepEqual(walk(outlines), [
    ['report.pdf', 0, [['One', 0, [['One.1', 1, []]]], ['Two', 2, []]]],
    ['annex.pdf', 3, [['Annex', 4, []]]],
  ]);
  assert.equal(outlines.lookup(PDFName.of('Count')).asNumber(), 6);
});
