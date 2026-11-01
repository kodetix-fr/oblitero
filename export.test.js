import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from './vendor/pdf-lib.esm.min.js';
import { buildPdf } from './export.js';
import { createPages } from './pages-model.js';

async function makeSource() {
  const document = await PDFDocument.create();
  document.setTitle('SECRET-TITLE');
  document.setAuthor('SECRET-AUTHOR');
  for (const size of [100, 200, 300]) document.addPage([size, size]);
  document.getPage(1).setRotation(degrees(90));
  return document.save({ useObjectStreams: false });
}

const hexText = (text) => `FEFF${[...text].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`.toUpperCase();
const hasText = (bytes, text) => Buffer.from(bytes).toString('latin1').toUpperCase().includes(hexText(text));

const noBurn = () => {
  throw new Error('no page should be burnt');
};

test('buildPdf follows the order of the entries and adds the rotation to the one of the page', async () => {
  const entries = createPages(3);
  const output = await PDFDocument.load(
    await buildPdf(await makeSource(), [{ ...entries[2], rotation: 90 }, { ...entries[1], rotation: 180 }, entries[0]], noBurn),
  );
  assert.deepEqual(output.getPages().map((page) => page.getWidth()), [300, 200, 100]);
  assert.deepEqual(output.getPages().map((page) => page.getRotation().angle), [90, 270, 0]);
});

test('buildPdf keeps no metadata of the source and signs the output', async () => {
  const source = await makeSource();
  assert.ok(hasText(source, 'SECRET-TITLE') && hasText(source, 'SECRET-AUTHOR'));
  const bytes = await buildPdf(source, createPages(3), noBurn);
  const output = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(output.getProducer(), 'Oblitero');
  assert.equal(output.getCreator(), 'Oblitero');
  assert.equal(output.getTitle(), undefined);
  assert.equal(output.getAuthor(), undefined);
});
