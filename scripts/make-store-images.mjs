// Writes the visuals of the store to dist/store/: five screenshots at 1280x800 and the small tile, on made-up documents.
// Usage: node scripts/make-store-images.mjs   (needs: npx playwright-core install chromium)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from '../vendor/pdf-lib.esm.min.js';
import { REPO, launchExtension } from '../test/e2e/support/browser.mjs';

const OUT = join(REPO, 'dist', 'store');
const LINES = [
  'This review covers the work of each team over the past quarter, with the budget',
  'that was agreed in January and what was actually spent. Delivery costs went down',
  'after the move to the new warehouse, and most orders now ship within two days.',
  'Customer support answered faster than last year, even with more requests to handle.',
  'The plan for next year keeps the same priorities: fewer late orders, clearer invoices',
  'and a simpler catalogue. Each team will report on its progress at the end of March.',
];

function paragraph(page, font, top, lines, seed) {
  for (let line = 0; line < lines; line++) {
    page.drawText(LINES[(seed + line) % LINES.length], { x: 56, y: top - line * 17, size: 10.5, font, color: rgb(0.2, 0.22, 0.28) });
  }
}

async function makeDocument(dir, name, title, color, count, details = []) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < count; i++) {
    const page = document.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color });
    page.drawText(title, { x: 56, y: 804, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`Section ${i + 1}`, { x: 56, y: 740, size: 15, font: bold, color: rgb(0.1, 0.12, 0.18) });
    (details[i] ?? []).forEach((line, index) => page.drawText(line, { x: 56, y: 708 - index * 20, size: 11.5, font, color: rgb(0.1, 0.12, 0.18) }));
    paragraph(page, font, 640, 12, i);
    page.drawRectangle({ x: 56, y: 330, width: 483, height: 70 + (i % 3) * 50, color, opacity: 0.18 });
    paragraph(page, font, 300, 6, i + 3);
  }
  const path = join(dir, name);
  writeFileSync(path, await document.save());
  return path;
}

const shot = (page, name) => page.screenshot({ path: join(OUT, name) });

mkdirSync(OUT, { recursive: true });
const app = await launchExtension();
try {
  const iban = ['FR76', '3000', '6000', '0112', '3456', '7890', '189'].join(' ');
  const report = await makeDocument(app.dir, 'annual-report.pdf', 'Annual report', rgb(0.15, 0.39, 0.92), 7);
  const contract = await makeDocument(app.dir, 'contract.pdf', 'Service contract', rgb(0.06, 0.55, 0.45), 5, [
    [`Billing contact: jane.doe@example.org`, `Bank account: ${iban}`, 'Phone: +33 1 99 00 12 34'],
  ]);
  const page = await app.openApp();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setInputFiles('#pages-file', [report, contract]);
  await page.locator('#grid li').nth(11).waitFor();
  await page.locator('#zoom').fill('130');
  await page.waitForTimeout(800);

  const card = (n) => page.getByRole('button', { name: new RegExp(`^Page ${n}(,|$)`) });
  await card(2).click();
  await card(5).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(300);
  await shot(page, 'screenshot-1.png');
  await page.locator('#select-none').click();

  await page.locator('#split-size').fill('4');
  await page.locator('#cut-every').click();
  await page.waitForTimeout(500);
  await shot(page, 'screenshot-2.png');
  await page.locator('#undo').click();

  await page.locator('#find').click();
  await page.locator('#find-dialog').waitFor({ state: 'visible' });
  await page.locator('#find-run').click();
  await page.locator('#find-results li').nth(1).waitFor();
  await shot(page, 'screenshot-3.png');
  await page.locator('#find-apply').click();
  await page.locator('#find-dialog').waitFor({ state: 'hidden' });
  await page.waitForTimeout(500);

  await page.locator('#sign').click();
  await page.getByRole('radio', { name: 'Type' }).check();
  await page.locator('#sign-text').fill('Jane Doe');
  await page.locator('#sign-use').click();
  await page.locator('#place-dialog').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await shot(page, 'screenshot-4.png');
  await page.locator('#place-go').click();
  await page.locator('#place-dialog').waitFor({ state: 'hidden' });

  await page.locator('#preview-open').click();
  await page.locator('#preview-dialog').waitFor({ state: 'visible' });
  await page.locator('#preview-dialog canvas').first().waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'screenshot-5.png');
  await page.close();

  const logo = readFileSync(join(REPO, 'docs', 'logo.svg'), 'utf8');
  const tile = await app.context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html><body style="margin:0;width:440px;height:280px;display:grid;place-items:center;background:#f4f6fb;font-family:Helvetica,Arial,sans-serif;color:#0e1522">
    <div style="text-align:center"><div style="width:112px;height:112px;margin:auto">${logo.replace('width="128" height="128"', 'width="112" height="112"')}</div>
    <div style="font-size:34px;font-weight:700;margin-top:10px">Oblitero</div><div style="font-size:16px;margin-top:6px;color:#44506a">PDF tools that stay on your computer</div></div></body>`);
  await tile.screenshot({ path: join(OUT, 'tile-440x280.png') });
} finally {
  await app.close();
}
console.log(`Written to ${OUT}`);
