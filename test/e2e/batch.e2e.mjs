import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';
import { readZip } from './support/zip.mjs';

let app;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

test('five files give five PDFs in a ZIP, each with its own pages and the changes made, and a report', async () => {
  const paths = [];
  for (let i = 1; i <= 5; i++) paths.push(await writePdf(app.dir, `file-${i}.pdf`, Array.from({ length: i }, () => ({ size: 200 + i, text: `f${i}` }))));
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', paths);
  await page.locator('#grid li').nth(14).waitFor();
  await page.locator('#select-all').click();
  await page.locator('#rotate-right').click();
  await page.locator('#select-none').click();
  await page.getByRole('radio', { name: 'Light' }).check();

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-each').click()]);
  const files = readZip(readFileSync(await download.path()));
  assert.deepEqual(files.map((file) => file.name).sort(), ['file-1.pdf', 'file-2.pdf', 'file-3.pdf', 'file-4.pdf', 'file-5.pdf', 'report.txt']);
  for (const file of files.filter((entry) => entry.name.endsWith('.pdf'))) {
    const n = Number(/file-(\d)/.exec(file.name)[1]);
    const document = await PDFDocument.load(file.data);
    assert.equal(document.getPageCount(), n);
    assert.ok(document.getPages().every((p) => p.getRotation().angle === 90 && Math.round(p.getWidth()) === 200 + n));
  }
  const report = Buffer.from(files.find((file) => file.name === 'report.txt').data).toString();
  assert.equal(report.trim().split('\n').length, 5);
  assert.match(report, /file-3\.pdf: done/);
  await page.close();
});
