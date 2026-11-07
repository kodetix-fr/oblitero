import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
let page;
before(async () => {
  app = await launchExtension();
  page = await app.openApp();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

test('qpdf in the extension opens files encrypted with RC4 40 and 128 bits, AES-128 and AES-256, and refuses a wrong password', async () => {
  const results = await page.evaluate(async () => {
    const { runQpdf, decryptPdf, WrongPassword } = await import('/qpdf-run.js');
    const { PDFDocument } = await import('/vendor/pdf-lib.esm.min.js');
    const source = await PDFDocument.create();
    source.addPage([200, 300]);
    source.addPage([300, 200]);
    const bytes = await source.save();
    const found = {};
    for (const [name, bits, weak] of [['rc4-40', '40', true], ['rc4-128', '128', true], ['aes-128', '128', false], ['aes-256', '256', false]]) {
      const extra = bits === '128' && !weak ? ['--use-aes=y'] : [];
      const made = await runQpdf(bytes, [...(weak ? ['--allow-weak-crypto'] : []), '--encrypt', '--user-password=s3cret', '--owner-password=boss', `--bits=${bits}`, ...extra, '--']);
      let encrypted = false;
      try {
        await PDFDocument.load(made.output);
      } catch {
        encrypted = true;
      }
      let wrong = null;
      try {
        await decryptPdf(made.output, 'nope');
      } catch (error) {
        wrong = error instanceof WrongPassword;
      }
      const clear = await PDFDocument.load(await decryptPdf(made.output, 's3cret'));
      found[name] = { made: made.code, encrypted, wrong, pages: clear.getPageCount() };
    }
    return found;
  });
  for (const name of ['rc4-40', 'rc4-128', 'aes-128', 'aes-256']) assert.deepEqual(results[name], { made: 0, encrypted: true, wrong: true, pages: 2 }, name);
});

// Bytes made in the page with qpdf, written to a file for the file input.
async function encrypted(name, user, pages) {
  const data = await page.evaluate(
    async ({ user, pages }) => {
      const { runQpdf } = await import('/qpdf-run.js');
      const { PDFDocument } = await import('/vendor/pdf-lib.esm.min.js');
      const source = await PDFDocument.create();
      for (let i = 0; i < pages; i++) source.addPage([200 + i, 300]);
      const made = await runQpdf(await source.save(), ['--encrypt', `--user-password=${user}`, '--owner-password=boss', '--bits=256', '--']);
      return [...made.output];
    },
    { user, pages },
  );
  const path = join(app.dir, name);
  writeFileSync(path, Buffer.from(data));
  return path;
}

test('a protected file asks for its password, says when it is wrong, and opens; one that only restricts opens at once', async () => {
  const view = await app.openApp();
  await view.setInputFiles('#pages-file', await encrypted('locked.pdf', 'secret', 3));
  await view.locator('#password-dialog').waitFor({ state: 'visible' });
  assert.match(await view.locator('#password-file').innerText(), /locked\.pdf/);
  await view.locator('#password-input').fill('wrong');
  await view.locator('#password-open').click();
  await view.waitForFunction(() => document.getElementById('password-error').textContent.length > 0);
  await view.locator('#password-input').fill('secret');
  await view.locator('#password-input').press('Enter');
  await view.locator('#grid li').nth(2).waitFor();

  await view.setInputFiles('#pages-file', await encrypted('restricted.pdf', '', 2));
  await view.locator('#grid li').nth(4).waitFor();
  assert.equal(await view.locator('#password-dialog').isVisible(), false);
  await view.close();
});

test('the downloads are protected by the password typed in the result panel, and the preview is not', async () => {
  const view = await app.openApp();
  await view.setInputFiles('#pages-file', await writePdf(app.dir, 'plain.pdf', [{ size: 200, text: 'x' }, { size: 210, text: 'y' }]));
  await view.locator('#grid li').nth(1).waitFor();
  await view.locator('#protect-password').fill('open sesame');
  await view.locator('#protect-copy').uncheck();
  const [file] = await Promise.all([view.waitForEvent('download'), view.locator('#download-all').click()]);
  const bytes = readFileSync(await file.path());
  await assert.rejects(PDFDocument.load(bytes), /encrypted/i);
  const opened = await view.evaluate(async (data) => {
    const { decryptPdf, WrongPassword } = await import('/qpdf-run.js');
    const { PDFDocument } = await import('/vendor/pdf-lib.esm.min.js');
    const refused = await decryptPdf(new Uint8Array(data), 'nope').then(() => false, (error) => error instanceof WrongPassword);
    return { refused, pages: (await PDFDocument.load(await decryptPdf(new Uint8Array(data), 'open sesame'))).getPageCount() };
  }, [...bytes]);
  assert.deepEqual(opened, { refused: true, pages: 2 });

  await view.locator('#preview-open').click();
  await view.locator('#preview-page canvas').waitFor();
  await view.close();
});

test('a file cut short opens with the pages that are whole, and the status says how many were recovered', async () => {
  const source = await PDFDocument.create();
  for (let i = 0; i < 40; i++) source.addPage([200, 300]).drawText(`page ${i + 1}`, { x: 20, y: 20, size: 12 });
  const whole = await source.save({ useObjectStreams: false });
  // Cut in the middle, as a download that stopped: the end of the pages, the page tree and the cross-reference table are lost.
  const path = join(app.dir, 'damaged.pdf');
  writeFileSync(path, whole.slice(0, Math.floor(whole.length * 0.6)));
  const view = await app.openApp();
  await view.setInputFiles('#pages-file', path);
  await view.locator('#grid li').first().waitFor();
  const count = await view.locator('#grid li').count();
  assert.ok(count > 10 && count < 40, String(count));
  assert.equal(await view.locator('#pages-status').innerText(), `damaged.pdf was damaged and has been repaired: ${count} pages recovered out of 40 pages.`);
  await view.close();
});
