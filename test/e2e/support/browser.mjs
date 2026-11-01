// Launches Playwright's Chromium with a throwaway copy of the extension, in a throwaway profile.
import { chromium } from 'playwright-core';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from '../../../vendor/pdf-lib.esm.min.js';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NOT_SHIPPED = /(^|\/)(node_modules|\.git|\.github|test|coverage|dist)(\/|$)|\.test\.js$|^(package(-lock)?\.json|eslint\.config\.js|tsconfig.*\.json)$/;

export async function launchExtension() {
  const root = mkdtempSync(join(tmpdir(), 'obl-'));
  const ext = join(root, 'ext');
  cpSync(REPO, ext, {
    recursive: true,
    filter: (source) => !NOT_SHIPPED.test(source.slice(REPO.length + 1)),
  });
  const cleanup = () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

  let context;
  try {
    context = await chromium.launchPersistentContext(join(root, 'profile'), {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-first-run', '--no-default-browser-check'],
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    const watch = (page) => {
      page.on('console', (message) => message.type() === 'error' && errors.push(`[console.error] ${message.text()}`));
      page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
    };
    context.pages().forEach(watch);
    context.on('page', watch);

    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
    const id = worker.url().split('/')[2];
    return {
      context,
      worker,
      id,
      errors,
      dir: root,
      async openApp() {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${id}/app.html`);
        return page;
      },
      async close() {
        await context.close();
        cleanup();
      },
    };
  } catch (error) {
    await context?.close().catch(() => {});
    cleanup();
    throw error;
  }
}

// One page per entry of `pages`: { size, text }. The text is drawn in the upper left corner.
export async function writePdf(dir, name, pages, { title } = {}) {
  const document = await PDFDocument.create();
  if (title) document.setTitle(title);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const { size, text } of pages) {
    const page = document.addPage([size, size]);
    if (text) page.drawText(text, { x: 20, y: size - 50, size: 24, font });
  }
  const path = join(dir, name);
  writeFileSync(path, await document.save({ useObjectStreams: false }));
  return path;
}
