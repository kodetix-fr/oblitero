import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees } from './vendor/pdf-lib.esm.min.js';
import { NO_STAMPS, anchor, applyStamps, bandText, batesText, checkText, cornerOf, drawSheet, label, tileCenters, toPage } from './stamps.js';

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

test('cornerOf finds the corner of a box turned around its center', () => {
  assert.deepEqual(cornerOf(100, 100, 40, 10, 0), { x: 80, y: 95 });
  const turned = cornerOf(100, 100, 40, 10, 90);
  assert.ok(Math.abs(turned.x - 105) < 1e-9 && Math.abs(turned.y - 80) < 1e-9, JSON.stringify(turned));
});

test('tileCenters fills the page in rows shifted by half a step, and never holds more than a few hundred marks', () => {
  const few = tileCenters(600, 800, 300, 60, 0);
  assert.ok(few.length >= 6 && few.length <= 30, `${few.length} marks`);
  const rows = [...new Set(few.map(([, y]) => y))];
  const firstX = rows.map((y) => Math.min(...few.filter(([, other]) => other === y).map(([x]) => x)));
  assert.ok(firstX[0] !== firstX[1], 'the second row is shifted');
  assert.ok(few.every(([x, y]) => x >= 0 && y >= 0 && x < 600 + 300 && y < 800 + 100));
  const many = tileCenters(600, 800, 10, 6, 0);
  assert.ok(many.length > 100 && many.length <= 700, `${many.length} marks`);
  const turned = tileCenters(600, 800, 300, 60, 45);
  assert.ok(turned.length < few.length * 2 && turned.length >= 4);
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// How many times the pages draw an image, and the opacity of what they draw.
async function marked(mark, extra = {}) {
  const document = await PDFDocument.create();
  for (let i = 0; i < 3; i++) document.addPage([300, 400]);
  await applyStamps(document, { ...NO_STAMPS, ...extra, watermark: { kind: 'image', image: { bytes: new Uint8Array(PNG), kind: 'png' }, scale: 50, opacity: 0.4, angle: 30, tile: false, ...mark } });
  const reloaded = await PDFDocument.load(await document.save());
  const draws = reloaded.getPages().map((page) => {
    const contents = page.node.Contents();
    const parts = !contents ? [] : contents instanceof PDFArray ? contents.asArray().map((ref) => page.node.context.lookup(ref)) : [contents];
    const content = parts.map((part) => Buffer.from(part instanceof PDFRawStream ? decodePDFRawStream(part).decode() : part.getUnencodedContents())).join('\n');
    return (content.match(/\bDo\b/g) ?? []).length;
  });
  const opacities = [];
  for (const page of reloaded.getPages()) {
    const states = page.node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    for (const [, value] of states?.entries() ?? []) opacities.push(page.node.context.lookup(value).get(PDFName.of('ca')).asNumber());
  }
  return { draws, opacities };
}

test('an image watermark is drawn once on each page of the range, with the opacity asked, and repeated when it is tiled', async () => {
  const once = await marked({}, { range: '2-3' });
  assert.deepEqual(once.draws, [0, 1, 1]);
  assert.ok(once.opacities.every((value) => Math.abs(value - 0.4) < 1e-9) && once.opacities.length >= 1, JSON.stringify(once.opacities));
  const tiled = await marked({ tile: true, scale: 20 });
  assert.ok(tiled.draws.every((count) => count > 1), JSON.stringify(tiled.draws));
  const stronger = await marked({ opacity: 0.8 });
  assert.deepEqual(stronger.draws, [1, 1, 1]);
  assert.ok(stronger.opacities.every((value) => Math.abs(value - 0.8) < 1e-9));
});

test('applyStamps can stamp a one-page output as a given page of a longer document', async () => {
  const output = await PDFDocument.create();
  output.addPage([300, 300]);
  await applyStamps(output, { ...NO_STAMPS, numbers: { position: 'bottom-center', format: 'of', first: 1, size: 10, skipFirst: false } }, { index: 6, total: 12 });
  const skipped = await PDFDocument.create();
  skipped.addPage([300, 300]);
  await applyStamps(skipped, { ...NO_STAMPS, numbers: { position: 'bottom-center', format: 'of', first: 1, size: 10, skipFirst: true } }, { index: 0, total: 12 });
  const contents = (document) => document.getPages()[0].node.Contents();
  assert.ok(contents(output));
  assert.equal(contents(skipped), undefined);
});

test('a letterhead fills the displayed page, upright, under the content or over it', async () => {
  const paper = await PDFDocument.create();
  paper.addPage([200, 100]);
  const output = await PDFDocument.create();
  const page = output.addPage([400, 400]);
  page.drawText('body', { x: 10, y: 10, size: 10 });
  const turned = output.addPage([100, 200]);
  turned.setRotation(degrees(90));
  const [sheet] = await output.embedPdf(await paper.save(), [0]);
  const decode = (ref) => new TextDecoder().decode(output.context.lookup(ref).getUnencodedContents());
  const contents = (target) => target.node.Contents().asArray().map(decode);

  drawSheet(page, sheet, true, 1);
  const under = contents(page);
  assert.match(under[0], /^q\n2 0 0 2 0 100 cm\n\/Sheet-\d+ Do\nQ/);
  assert.ok(under.slice(1).some((text) => text.includes('<626F6479> Tj')));

  drawSheet(page, sheet, false, 0.5);
  assert.match(contents(page).at(-1), /\/Sheet-\d+ gs\n2 0 0 2 0 100 cm\n/);
  assert.ok(page.node.Resources().lookup(PDFName.of('ExtGState')));

  drawSheet(turned, sheet, false, 1);
  assert.match(contents(turned).at(-1), /0 1 -1 0 100 0 cm/);
  assert.ok(turned.node.Contents() instanceof PDFArray);
});

// The texts drawn on each page, decoded from the hex strings of the standard font.
async function textsOf(document) {
  const reloaded = await PDFDocument.load(await document.save());
  return reloaded.getPages().map((page) => {
    const contents = page.node.Contents();
    const parts = !contents ? [] : contents instanceof PDFArray ? contents.asArray().map((ref) => page.node.context.lookup(ref)) : [contents];
    const content = parts.map((part) => Buffer.from(part instanceof PDFRawStream ? decodePDFRawStream(part).decode() : part.getUnencodedContents())).join('\n');
    return [...content.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) => Buffer.from(match[1], 'hex').toString('latin1'));
  });
}

test('Bates numbers go on from one part to the next, with their digits, prefix and suffix', async () => {
  const bates = { prefix: 'CASE-', suffix: '-A', first: 98, digits: 4, position: 'bottom-right', size: 10 };
  assert.equal(batesText(bates, 3), 'CASE-0101-A');
  const found = [];
  let offset = 0;
  for (const count of [2, 3, 1]) {
    const document = await PDFDocument.create();
    for (let i = 0; i < count; i++) document.addPage([300, 400]);
    await applyStamps(document, { ...NO_STAMPS, bates }, null, offset);
    found.push(...(await textsOf(document)).flat());
    offset += count;
  }
  assert.deepEqual(found, ['CASE-0098-A', 'CASE-0099-A', 'CASE-0100-A', 'CASE-0101-A', 'CASE-0102-A', 'CASE-0103-A']);
});

test('a text stamp is written in the content of the pages of the range, in a frame', async () => {
  const document = await PDFDocument.create();
  for (let i = 0; i < 3; i++) document.addPage([300, 400]);
  await applyStamps(document, { ...NO_STAMPS, range: '2', stamp: { kind: 'text', text: 'RECEIVED', size: 18, scale: 20, position: 'top-right', image: null } });
  assert.deepEqual(await textsOf(document), [[], ['RECEIVED'], []]);
});
