// Times the main operations on a document of scanned pages (one noisy photo per page, so the file is big and does not
// compress well): node scripts/bench.mjs [pages]. Building the file takes a while, about a second per page.
import { launchExtension } from '../test/e2e/support/browser.mjs';
import { PDFDocument } from '../vendor/pdf-lib.esm.min.js';
import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = Number(process.argv[2] ?? 60);
const app = await launchExtension();
try {
  const page = await app.openApp();
  const document = await PDFDocument.create();
  let t = Date.now();
  for (let i = 0; i < PAGES; i++) {
    const bytes = await page.evaluate(async (seed) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1600;
      const context = canvas.getContext('2d');
      const image = context.createImageData(1200, 1600);
      let s = seed * 7919 + 1;
      for (let p = 0; p < image.data.length; p += 4) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const v = (s >>> 24) & 255;
        image.data[p] = 120 + (v >> 2);
        image.data[p + 1] = 110 + (v >> 3);
        image.data[p + 2] = 100 + (v >> 2);
        image.data[p + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, i);
    const picture = await document.embedJpg(new Uint8Array(bytes));
    document.addPage([595, 842]).drawImage(picture, { x: 0, y: 0, width: 595, height: 842 });
  }
  const path = join(app.dir, 'scan.pdf');
  writeFileSync(path, await document.save());
  console.log(`${PAGES} scanned pages, ${(statSync(path).size / 1048576).toFixed(0)} MB, built in ${Date.now() - t} ms`);

  const heap = () => page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  t = Date.now();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid li').nth(PAGES - 1).waitFor({ timeout: 300000 });
  console.log(`open and build the grid: ${Date.now() - t} ms, heap ${await heap()} MB`);
  t = Date.now();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#grid canvas')).filter((c) => c.width !== 300).length >= 12, null, { timeout: 300000 });
  console.log(`first 12 thumbnails drawn: ${Date.now() - t} ms`);
  t = Date.now();
  await page.locator('#hide-blank').click();
  await page.waitForFunction(() => /^(Hid|No blank)/.test(document.getElementById('pages-status').textContent), null, { timeout: 600000 });
  console.log(`hide blank pages over ${PAGES} scans: ${Date.now() - t} ms, heap ${await heap()} MB`);
    t = Date.now();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.locator('#download-all').click()]);
  console.log(`download all: ${Date.now() - t} ms, ${(statSync(await download.path()).size / 1048576).toFixed(0)} MB, heap ${await heap()} MB`);
  t = Date.now();
  await page.getByRole('radio', { name: 'Balanced' }).check();
  t = Date.now();
  const [packed] = await Promise.all([page.waitForEvent('download', { timeout: 900000 }), page.locator('#download-all').click()]);
  console.log(`download compressed (Balanced): ${Date.now() - t} ms, ${(statSync(await packed.path()).size / 1048576).toFixed(1)} MB, heap ${await heap()} MB`);
  console.log('errors:', JSON.stringify(app.errors));
} finally {
  await app.close();
}
