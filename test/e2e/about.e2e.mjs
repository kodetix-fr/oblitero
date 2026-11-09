import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { launchExtension, writePdf } from './support/browser.mjs';

let app;
let path;
before(async () => {
  app = await launchExtension();
  path = await writePdf(app.dir, 'about.pdf', [{ size: 300, text: 'About' }]);
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

const store = (page, value) => page.evaluate((value) => new Promise((resolve, reject) => {
  const request = indexedDB.open('oblitero', 1);
  request.onsuccess = () => {
    const tx = request.result.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, 'about');
    tx.oncomplete = () => resolve(request.result.close());
    tx.onerror = () => reject(tx.error);
  };
}), value);

test('About: version, news of this line, and links that open in a new tab; a first install shows no dot', async () => {
  const page = await app.openApp();
  await page.waitForFunction(() => document.querySelector('#about-open'));
  assert.equal(await page.locator('#about-dot').isHidden(), true);
  await page.locator('#about-open').click();
  const { version } = await app.worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(await page.locator('#about-version').innerText(), `Version ${version}`);
  assert.equal(await page.locator('#about-news').isVisible(), true);
  for (const [id, href] of [
    ['about-review', 'https://chromewebstore.google.com/detail/oblitero-pdf-merge-redact/ofnapekaofoabpfodbffomjkpljmbdfd/reviews'],
    ['about-problem', 'https://github.com/kodetix-fr/oblitero/issues'],
    ['about-support', 'https://kodetix.fr/oblitero/soutenir'],
    ['about-obturo', 'https://chromewebstore.google.com/detail/obturo/kaafiicmlbdchfalaljmbeoblihjbnih'],
  ]) {
    const link = page.locator(`#${id}`);
    assert.equal(await link.getAttribute('href'), href);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  }
  await page.locator('#about-close').click();
  assert.equal(await page.locator('#about-dialog').isHidden(), true);
  await page.close();
});

test('after an update from an older line, a dot says there is news, until About is opened', async () => {
  const page = await app.openApp();
  await store(page, { seen: '0.1.4', downloads: 0, asked: 0, next: 5 });
  await page.reload();
  await page.locator('#about-dot').waitFor();
  assert.equal(await page.locator('#about-open').getAttribute('aria-describedby'), 'about-new');
  await page.locator('#about-open').click();
  assert.equal(await page.locator('#about-dot').isHidden(), true);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('#about-open').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#about-dot').isHidden(), true);
  await page.close();
});

test('the request for a review comes after five downloads, counts as shown at once, and No thanks ends it', async () => {
  const page = await app.openApp();
  await store(page, { seen: null, downloads: 0, asked: 0, next: 5 });
  await page.reload();
  await page.setInputFiles('#pages-file', path);
  await page.locator('#grid .card').first().waitFor();
  for (let i = 1; i <= 5; i++) {
    assert.equal(await page.locator('#ask').isHidden(), true, `before download ${i}`);
    await Promise.all([page.waitForEvent('download'), page.locator('#download-all').click()]);
  }
  await page.locator('#ask').waitFor();
  assert.equal(await page.locator('#ask-review').innerText(), 'Like Oblitero? Write a review');
  await page.reload();
  await page.locator('#about-open').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#ask').isHidden(), true, 'shown once, not at every opening');

  await store(page, { seen: null, downloads: 10, asked: 1, next: 10 });
  await page.reload();
  await page.locator('#ask').waitFor();
  await page.locator('#ask-never').click();
  assert.equal(await page.locator('#ask').isHidden(), true);
  await page.waitForFunction(() => new Promise((resolve) => {
    const request = indexedDB.open('oblitero', 1);
    request.onsuccess = () => {
      const get = request.result.transaction('kv').objectStore('kv').get('about');
      get.onsuccess = () => resolve(get.result.next === null);
    };
  }));
  await page.close();
});
