import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MSG_REF, listRuntimeFiles, localize, readLocales } from './scripts/package.mjs';
import { LANGUAGES } from './languages.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const manifest = JSON.parse(read('./manifest.json'));
const locales = readLocales(ROOT);
const runtime = listRuntimeFiles(ROOT);

test('no permission, no site access, nothing injected in a page', () => {
  assert.deepEqual(manifest.permissions, []);
  for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('content security policy: nothing outside the extension', () => {
  const directives = Object.fromEntries(manifest.content_security_policy.extension_pages.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(directives, {
    'default-src': ["'none'"], 'script-src': ["'self'", "'wasm-unsafe-eval'"], 'object-src': ["'none'"], 'style-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'blob:'], 'connect-src': ["'self'"], 'frame-src': ["'none'"], 'form-action': ["'none'"], 'base-uri': ["'none'"],
  });
});

// A policy does not stop what a browser opens ahead of its checks: a resource hint, or the navigation of a frame.
test('no network API, resource hint, frame or remote address in the code of the extension', () => {
  const code = (file) => read(`./${file}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const files = runtime.filter((file) => /\.(js|html)$/.test(file) && !file.startsWith('vendor/'));
  assert.ok(files.includes('sw.js') && files.includes('app.html') && files.includes('pages-view.js'), 'the scan reads the real files');
  for (const file of files) {
    const text = code(file);
    assert.doesNotMatch(text, /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|RTCPeerConnection|WebTransport)\b/, `${file}: a network API`);
    assert.doesNotMatch(text, /\brel\s*[=:]\s*['"]?(preconnect|dns-prefetch|prefetch|prerender)/, `${file}: a resource hint`);
    assert.doesNotMatch(text, /<(iframe|frame|object|embed)\b|createElement\(\s*['"](iframe|frame|object|embed)['"]/, `${file}: a frame or an embedded object`);
    // The SVG namespace, and the pages a click on a link of About opens: support, reviews, issues, Obturo.
    const allowed = new Set([
      'http://www.w3.org/2000/svg', 'https://kodetix.fr/oblitero/soutenir', 'https://github.com/kodetix-fr/oblitero/issues',
      'https://chromewebstore.google.com/detail/oblitero-pdf-merge-redact/ofnapekaofoabpfodbffomjkpljmbdfd/reviews',
      'https://chromewebstore.google.com/detail/obturo/kaafiicmlbdchfalaljmbeoblihjbnih',
    ]);
    assert.deepEqual((text.match(/https?:\/\/[^\s'"`)<>]+/g) ?? []).filter((url) => !allowed.has(url)), [], `${file}: a remote address`);
  }
});

test('the package holds the code and the licenses, and no test, document or tool', () => {
  for (const file of ['manifest.json', 'app.html', 'sw.js', 'LICENSE', 'vendor/pdf-lib.LICENSE', 'vendor/pdfjs/LICENSE', 'vendor/pdfjs/pdf.min.mjs', 'locales/ja.js', '_locales/ja/messages.json', 'icons/icon128.png']) {
    assert.ok(runtime.includes(file), file);
  }
  assert.deepEqual(runtime.filter((file) => /\.test\.js$|\.md$|\.d\.m?ts$|^(docs|scripts|test|dist|node_modules|\.github)\/|^package|^tsconfig|^eslint/.test(file)), []);
});

test('third-party code stays in vendor/', () => {
  assert.deepEqual(runtime.filter((file) => !file.startsWith('vendor/') && (/\.(mjs|wasm|map)$|\.min\./.test(file) || /@license|SPDX-License-Identifier|Copyright \d{4} /.test(/\.(js|html)$/.test(file) ? read(`./${file}`) : ''))), []);
});

test('the version of the manifest is the one of package.json, and a version Chrome accepts', () => {
  assert.equal(manifest.version, JSON.parse(read('./package.json')).version);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('name and description: every language has them, within the limits of the store', () => {
  assert.equal(manifest.default_locale, 'en');
  assert.deepEqual(Object.keys(locales).sort(), Object.keys(LANGUAGES).map((code) => code.replace('-', '_')).sort());
  for (const [lang, messages] of Object.entries(locales)) {
    const resolved = localize(manifest, messages);
    assert.ok(resolved.name.startsWith('Oblitero') && resolved.name.length <= 75, `${lang}: ${resolved.name}`);
    assert.ok(resolved.description.length > 0 && resolved.description.length <= 132, `${lang}: ${resolved.description.length} characters`);
    assert.doesNotMatch(JSON.stringify(resolved), MSG_REF, lang);
  }
});

test('the files the manifest names are in the package', () => {
  for (const file of [manifest.background.service_worker, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) {
    assert.ok(runtime.includes(file), file);
  }
});
