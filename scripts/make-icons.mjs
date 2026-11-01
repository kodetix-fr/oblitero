// Renders docs/logo.svg to icons/icon{16,32,48,128}.png: node scripts/make-icons.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'docs', 'logo.svg'), 'utf8');
mkdirSync(join(root, 'icons'), { recursive: true });

const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    writeFileSync(join(root, 'icons', `icon${size}.png`), await page.screenshot({ omitBackground: true }));
    console.log(`icons/icon${size}.png`);
  }
} finally {
  await browser.close();
}
