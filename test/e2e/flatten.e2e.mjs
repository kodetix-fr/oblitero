import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension } from './support/browser.mjs';

let app;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

// A filled text field, a checked box and a red square comment, half transparent.
async function formPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 300]);
  page.drawText('Name', { x: 20, y: 240, size: 12 });
  const field = document.getForm().createTextField('name');
  field.addToPage(page, { x: 20, y: 200, width: 200, height: 30 });
  field.setText('Ada Lovelace');
  const box = document.getForm().createCheckBox('agree');
  box.addToPage(page, { x: 20, y: 150, width: 24, height: 24 });
  box.check();
  const { context } = document;
  const square = context.register(context.formXObject([], { BBox: [0, 0, 60, 60] }));
  context.lookup(square).contents = new TextEncoder().encode('1 0 0 rg 0 0 60 60 re f');
  page.node.addAnnot(context.register(context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [200, 40, 260, 100], CA: 0.5, AP: { N: square } })));
  const path = join(app.dir, 'form.pdf');
  writeFileSync(path, await document.save());
  return path;
}

// The pixels of the first page of `bytes`, drawn by PDF.js with its annotations, compared with those of `other`: the share
// that differ.
async function difference(page, bytes, other) {
  return page.evaluate(
    async ({ one, two }) => {
      const { openRender, renderPage } = await import('/render.js');
      const pixels = async (data) => {
        const canvas = document.createElement('canvas');
        await renderPage(await openRender(new Uint8Array(data)), 0, 0, canvas, 1);
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [a, b] = await Promise.all([pixels(one), pixels(two)]);
      let differ = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) differ++;
      return differ / (a.length / 4);
    },
    { one: [...bytes], two: [...other] },
  );
}

test('flattening draws the fields and the comments into the page, which looks the same, and leaves no annotation', async () => {
  const source = await formPdf();
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', source);
  await page.locator('#grid li').first().waitFor();
  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  await page.locator('#props-flatten').check();
  await page.locator('#props-apply').click();
  await page.locator('#props-dialog').waitFor({ state: 'hidden' });
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  const flat = readFileSync(await file.path());

  const output = await PDFDocument.load(flat);
  assert.equal(output.getPage(0).node.has(PDFName.of('Annots')), false);
  assert.equal(output.catalog.has(PDFName.of('AcroForm')), false);
  const share = await difference(page, readFileSync(source), flat);
  assert.ok(share < 0.002, `${share} of the pixels differ`);
  const bare = await PDFDocument.load(readFileSync(source));
  bare.getPage(0).node.delete(PDFName.of('Annots'));
  assert.ok((await difference(page, readFileSync(source), await bare.save())) > 0.02);
  await page.close();
});
