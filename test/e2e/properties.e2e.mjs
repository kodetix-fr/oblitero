import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFString } from '../../vendor/pdf-lib.esm.min.js';
import { inspectPdf } from '../../properties.js';
import { launchExtension } from './support/browser.mjs';

let app;
let page;
let source;
before(async () => {
  app = await launchExtension();
  const document = await PDFDocument.create();
  document.setTitle('Secret plan');
  document.setAuthor('Jean Dupont');
  document.setKeywords(['internal', 'draft']);
  const first = document.addPage([400, 400]);
  document.addPage([400, 400]);
  await document.attach(new TextEncoder().encode('private note'), 'note.txt', { mimeType: 'text/plain' });
  const link = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 100, 40], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org') } }));
  first.node.set(PDFName.of('Annots'), document.context.obj([link]));
  source = join(app.dir, 'carrier.pdf');
  writeFileSync(source, await document.save());
  page = await app.openApp();
  await page.getByRole('tab', { name: 'Pages' }).click();
  await page.setInputFiles('#pages-file', source);
  await page.locator('#grid li').nth(1).waitFor();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

async function downloaded(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return readFileSync(await download.path());
}

test('the report says what the file carries, and the download carries none of it unless written', async () => {
  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  const report = await page.locator('#props-report').innerText();
  assert.match(report, /carrier\.pdf, 2 pages/);
  for (const expected of ['Secret plan', 'Jean Dupont', 'internal draft', 'note.txt']) assert.ok(report.includes(expected), `${expected} is not in the report`);
  assert.match(report.replace(/\s+/g, ' '), /Links 1/);
  assert.equal(await page.locator('#props-title-input').inputValue(), '');
  await page.locator('#props-cancel').click();
  await page.locator('#props-dialog').waitFor({ state: 'hidden' });

  const plain = await inspectPdf(await downloaded(() => page.locator('#download-all').click()));
  assert.deepEqual([plain.title, plain.author, plain.keywords, plain.files], [undefined, undefined, undefined, []]);
  assert.equal(plain.producer, 'Oblitero');
  assert.equal(plain.annotations.links, 1, 'the link of a copied page stays');
  assert.ok(plain.created instanceof Date);
});

test('the properties typed by the user are written, the dates can be left out, and links and comments can be removed', async () => {
  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  await page.locator('#props-title-input').fill('Clean title');
  await page.locator('#props-keywords').fill('one, two');
  await page.locator('#props-dates').uncheck();
  await page.locator('#props-strip').check();
  await page.locator('#props-apply').click();
  await page.waitForFunction(() => document.getElementById('selection-summary').textContent.includes('properties'));

  const written = await inspectPdf(await downloaded(() => page.locator('#download-all').click()));
  assert.equal(written.title, 'Clean title');
  assert.equal(written.keywords, 'one two');
  assert.equal(written.author, undefined);
  assert.equal(written.created, undefined);
  assert.equal(written.modified, undefined);
  assert.deepEqual(written.annotations, { links: 0, widgets: 0, others: 0 });

  await page.locator('#properties').click();
  await page.locator('#props-dialog').waitFor({ state: 'visible' });
  await page.locator('#props-reset').click();
  await page.locator('#props-apply').click();
  await page.waitForFunction(() => !document.getElementById('selection-summary').textContent.includes('properties'));
});
