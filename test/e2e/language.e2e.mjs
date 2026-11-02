import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchExtension, writePdf } from './support/browser.mjs';
import { LANGUAGES } from '../../languages.js';

const CODES = Object.keys(LANGUAGES);
const texts = Object.fromEntries(await Promise.all(CODES.map(async (code) => [code, (await import(`../../locales/${code}.js`)).default])));
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));

let app;
before(async () => {
  app = await launchExtension();
});
after(async () => {
  const errors = app.errors;
  await app.close();
  assert.deepEqual(errors, []);
});

test('the browser is in English, so the interface is', async () => {
  const page = await app.openApp();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#language').inputValue(), 'auto');
  assert.equal(await page.locator('#choose-pages').innerText(), texts.en['app.choose-pages']);
  await page.close();
});

test('the picker changes the language of everything at once, a status included, and the choice is kept', async () => {
  const path = await writePdf(app.dir, 'langue.pdf', [{ size: 200, text: 'A' }, { size: 200, text: 'B' }]);
  const broken = join(app.dir, 'casse.pdf');
  writeFileSync(broken, 'not a pdf');
  const page = await app.openApp();
  await page.setInputFiles('#pages-file', [path, broken]);
  await page.locator('#grid li').nth(1).waitFor();
  assert.equal(await page.locator('#pages-status').innerText(), fill(texts.en['status.cannot-read'], { names: 'casse.pdf' }));

  await page.locator('#language').selectOption('fr');
  const fr = texts.fr;
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  assert.equal(await page.locator('#add-files').innerText(), fr['app.add-files']);
  assert.equal(await page.locator('#add-files').getAttribute('title'), fr['app.add-files.title']);
  assert.equal(await page.locator('#select-range').getAttribute('placeholder'), fr['app.select-range.placeholder']);
  assert.equal(await page.locator('#pages-status').innerText(), fill(fr['status.cannot-read'], { names: 'casse.pdf' }));
  assert.equal(await page.locator('#grid .card').first().getAttribute('aria-label'), fill(fr['page.n'], { n: 1 }));
  assert.equal(await page.locator('#hide-label').innerText(), fr['hide.label']);
  assert.equal(await page.locator('#compress-levels label').nth(2).innerText(), fr['level.balanced']);
  assert.equal(await page.locator('#compress-describe').innerText(), fr['level.none-desc']);
  assert.equal(await page.locator('#images-size option').first().innerText(), fr['photo.size.fit']);

  await page.getByRole('radio', { name: fr['level.balanced'] }).check();
  assert.equal(await page.locator('#compress-describe').innerText(), fr['level.balanced-desc']);
  await page.locator('#language').selectOption('en');
  assert.equal(await page.locator('#compress-describe').innerText(), texts.en['level.balanced-desc']);
  await page.locator('#language').selectOption('ja');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
  assert.equal(await page.locator('#language').inputValue(), 'ja');
  assert.equal(await page.locator('#choose-pages').innerText(), texts.ja['app.choose-pages']);
  await page.locator('#language').selectOption('auto');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.close();
});

test('every language draws the screens, the dialogs and the files view without a raw key', async () => {
  const path = await writePdf(app.dir, 'toutes.pdf', [{ size: 200, text: 'A' }, { size: 200, text: 'B' }]);
  const RAW = /\b(?:app|redact|stamp|export|find|sign|place|compare|props|status|summary|card|cut|hide|files|level|photo|position|preset|count|page|list|name|parts|size|error|text|drop|language)[.-][a-z]+(?:[.-][a-z]+)*\b/;
  const page = await app.openApp();
  for (const code of CODES) {
    await page.evaluate((value) => localStorage.setItem('oblitero-language', value), code);
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('lang'), code);
    assert.equal(await page.locator('#choose-pages').innerText(), texts[code]['app.choose-pages'], code);
    await page.setInputFiles('#pages-file', path);
    await page.locator('#grid li').nth(1).waitFor();
    await page.locator('#grid .card').first().click();
    await page.locator('#compress-levels label').nth(3).click();
    const visible = async (label) => {
      const body = await page.locator('body').innerText();
      assert.doesNotMatch(body, RAW, `${code}, ${label}: a raw key is shown: ${RAW.exec(body)?.[0]}`);
    };
    await visible('pages');
    for (const [button, dialog] of [['#stamps', '#stamp-dialog'], ['#find', '#find-dialog'], ['#sign', '#sign-dialog'], ['#properties', '#props-dialog'], ['#export-images', '#export-dialog'], ['#redact', '#redact-dialog'], ['#compare-open', '#compare-dialog']]) {
      await page.locator(button).click();
      await page.locator(dialog).waitFor({ state: 'visible' });
      await page.waitForTimeout(150);
      await visible(dialog);
      await page.keyboard.press('Escape');
      await page.locator(dialog).waitFor({ state: 'hidden' });
    }
    await page.locator('#view-switch label').first().click();
    await visible('files');
    await page.locator('#clear-all').click();
    await visible('empty');
  }
  await page.evaluate(() => localStorage.removeItem('oblitero-language'));
  await page.close();
});
