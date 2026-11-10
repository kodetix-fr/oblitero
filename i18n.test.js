import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Failure, LANGUAGES, failureText, formatFixed, formatNumber, getLanguage, hasLanguage, loadLanguage, plural, pluralForm, resolveLanguage, setLanguage, t } from './i18n.js';
import { formatSize } from './compress.js';

const CODES = Object.keys(LANGUAGES);
const OTHERS = CODES.filter((code) => code !== 'en');
/** @type {Record<string, Record<string, string>>} */
const dictionaries = {};
for (const code of CODES) {
  dictionaries[code] = (await import(`./locales/${code}.js`)).default;
  assert.equal(await loadLanguage(code), code, `${code} loads`);
}
const en = dictionaries.en;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const folder = (code) => code.replace('-', '_');

test('resolveLanguage: explicit choice, then the browser language (exact, another region, bare language), then English', () => {
  assert.equal(resolveLanguage('fr', 'en-US'), 'fr');
  assert.equal(resolveLanguage('auto', 'fr-FR'), 'fr');
  assert.equal(resolveLanguage('auto', 'fr_CA'), 'fr');
  assert.equal(resolveLanguage('auto', 'pt-BR'), 'pt-BR');
  assert.equal(resolveLanguage('auto', 'pt_BR'), 'pt-BR');
  assert.equal(resolveLanguage('auto', 'pt-PT'), 'pt-BR');
  assert.equal(resolveLanguage('auto', 'zh-Hans-CN'), 'zh-CN');
  assert.equal(resolveLanguage('auto', 'es-419'), 'es');
  assert.equal(resolveLanguage('auto', 'ID'), 'id');
  assert.equal(resolveLanguage('auto', 'nl'), 'en');
  assert.equal(resolveLanguage('auto'), 'en');
  assert.equal(resolveLanguage('constructor', 'fr'), 'fr');
  assert.equal(resolveLanguage(/** @type {any} */ (5), 'fr'), 'fr');
});

test('setLanguage ignores an unknown language; loadLanguage answers English for one', async () => {
  assert.equal(setLanguage('fr'), 'fr');
  assert.equal(getLanguage(), 'fr');
  assert.equal(setLanguage('klingon'), 'en');
  assert.equal(await loadLanguage('klingon'), 'en');
  assert.equal(hasLanguage('klingon'), false);
  assert.equal(hasLanguage('ja'), true);
});

test('t: variables, then English when a key is missing, then the key itself', () => {
  setLanguage('en');
  assert.equal(t('status.failed', { message: 'boom' }), 'Failed: boom');
  assert.equal(t('status.failed'), 'Failed: {message}', 'a variable that is not given stays visible');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('fr');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('en');
});

test('failureText: an error of ours speaks the language, a library error gets a sentence and goes to the console', () => {
  const logged = mock.method(console, 'error', () => {});
  setLanguage('fr');
  assert.equal(failureText(new Failure('error.page-large')), dictionaries.fr['error.page-large']);
  assert.equal(failureText(new Error('pdf-lib: bad xref')), dictionaries.fr['error.unknown']);
  assert.equal(logged.mock.callCount(), 1);
  setLanguage('en');
  logged.mock.restore();
});

test('plural: 0 and 1 are singular in French, every count above 1 is plural everywhere', () => {
  assert.deepEqual([0, 1, 2, 21].map((n) => pluralForm('fr', n)), ['one', 'one', 'other', 'other']);
  assert.deepEqual([0, 1, 2, 21].map((n) => pluralForm('en', n)), ['other', 'one', 'other', 'other']);
  assert.deepEqual([1, 2, 21, 22].map((n) => pluralForm('ru', n)), ['one', 'other', 'other', 'other']);
  setLanguage('en');
  assert.deepEqual([1, 2].map((n) => plural(n, 'count.page.one', 'count.page.other')), ['1 page', '2 pages']);
  assert.equal(plural(1234, 'count.page.one', 'count.page.other'), '1,234 pages');
  setLanguage('fr');
  assert.match(plural(1500, 'count.page.one', 'count.page.other'), /^1\s?500\s/u);
  setLanguage('en');
});

test('numbers and sizes follow the language', () => {
  setLanguage('en');
  assert.equal(formatFixed(2, 1), '2.0');
  assert.deepEqual([512, 2048, 150 * 1024, 3 * 1048576].map(formatSize), ['512 B', '2.0 KB', '150 KB', '3.00 MB']);
  setLanguage('de');
  assert.equal(formatFixed(2.5, 1), '2,5');
  assert.equal(formatNumber(1234.5), '1.234,5');
  assert.match(formatSize(3 * 1048576), /^3,00\s/);
  setLanguage('en');
});

test('locales: same keys in the same order, same placeholders, no empty text, no dash, no HTML', () => {
  for (const code of OTHERS) {
    const dict = dictionaries[code];
    assert.deepEqual(Object.keys(dict), Object.keys(en), `${code}: keys or order differ from English`);
    for (const key of Object.keys(en)) {
      assert.equal(typeof dict[key], 'string', `${code} ${key}: not a string`);
      assert.equal(placeholders(dict[key]), placeholders(en[key]), `${code} ${key}: placeholders differ`);
      if (key !== 'sentence-gap') assert.ok(dict[key].trim(), `${code} ${key}: empty text`);
      assert.doesNotMatch(dict[key], /[–—―]/, `${code} ${key}: an em or en dash (plain hyphens only)`);
      assert.doesNotMatch(dict[key], /<[a-z/]/i, `${code} ${key}: HTML`);
    }
  }
  for (const key of Object.keys(en)) assert.doesNotMatch(en[key], /[–—―]/, `en ${key}: a dash`);
});

test('locales: every count has its singular and its plural, and a language without plural gives the same text twice', () => {
  const counts = Object.keys(en).filter((key) => /[.-]one$/.test(key));
  assert.ok(counts.length >= 6);
  for (const code of CODES) {
    for (const one of counts) {
      const other = one.replace(/one$/, 'other');
      assert.ok(Object.hasOwn(dictionaries[code], other), `${code}: ${other} is missing`);
      if (['ja', 'zh-CN', 'id'].includes(code)) assert.equal(dictionaries[code][one], dictionaries[code][other], `${code} ${one}: no plural in this language`);
    }
  }
});

const sources = () =>
  readdirSync('.')
    .filter((name) => /\.js$/.test(name) && !/\.test\.js$/.test(name) && name !== 'eslint.config.js')
    .map((name) => readFileSync(name, 'utf8'))
    .concat(readFileSync('app.html', 'utf8'))
    .join('\n');
// Keys the code builds from a prefix: the prefix and where it is written.
const DYNAMIC = [['position.', "'position.'"], ['preset.', '`preset.'], ['level.', '`level.'], ['photo.size.', "'photo.size.'"], ['photo.margin.', "'photo.margin.'"], ['sign.error-', '`sign.error-']];

test('the code only asks for keys that exist, and every key is used', () => {
  const code = sources();
  const spaces = new Set(Object.keys(en).filter((key) => key.includes('.')).map((key) => key.split('.')[0]));
  const asked = new Set([...code.matchAll(/['"`]([a-z]+)\.([a-z0-9-]+(?:\.[a-z0-9-]+)*)['"`]/g)].filter((m) => spaces.has(m[1]) && !/^(html|js|css|json|pdf|png|jpg|zip|txt)$/.test(m[2])).map((m) => `${m[1]}.${m[2]}`));
  for (const key of [...code.matchAll(/data-i18n[\w-]*="([^"]+)"/g)].map((m) => m[1])) asked.add(key);
  for (const key of asked) assert.ok(Object.hasOwn(en, key), `the code asks for ${key}, which English does not have`);
  for (const key of Object.keys(en)) {
    const used = code.includes(`'${key}'`) || code.includes(`"${key}"`) || DYNAMIC.some(([prefix, written]) => key.startsWith(prefix) && code.includes(written));
    assert.ok(used, `${key} is not used by the code`);
  }
});

test('every language has its manifest messages, and the manifest only asks for messages that exist', () => {
  const manifest = readFileSync('manifest.json', 'utf8');
  const asked = [...manifest.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(asked)].sort(), ['actionTitle', 'extDescription', 'extName']);
  assert.match(manifest, /"default_locale": "en"/);
  const folders = readdirSync('_locales').sort();
  assert.deepEqual(folders, CODES.map(folder).sort(), 'one _locales folder per language');
  for (const name of folders) {
    const messages = JSON.parse(readFileSync(`_locales/${name}/messages.json`, 'utf8'));
    assert.deepEqual(Object.keys(messages).sort(), ['actionTitle', 'extDescription', 'extName'], name);
    assert.ok(messages.extDescription.message.length <= 132, `${name}: the description is over 132 characters`);
    assert.doesNotMatch(messages.extDescription.message, /[–—]/, `${name}: a dash`);
  }
});
