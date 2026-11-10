import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './scripts/package.mjs';

const SCRIPT = fileURLToPath(new URL('./scripts/package.mjs', import.meta.url));
const LICENSES = ['LICENSE', 'vendor/pdf-lib.LICENSE', 'vendor/pdfjs/LICENSE', 'vendor/qpdf/LICENSE_QPDF', 'vendor/qpdf/NOTICE_QPDF.txt', 'vendor/qpdf/LICENSE_QPDF_WASM', 'vendor/qpdf/LICENSE_ZLIB', 'vendor/qpdf/LICENSE_JPEG_TURBO.txt'];
const MANIFEST = { manifest_version: 3, name: 'Fixture', description: 'A fixture', version: '1.2.3', background: { service_worker: 'sw.js' }, icons: { 16: 'icons/i.png' }, action: { default_icon: { 16: 'icons/i.png' } } };

// A folder shaped like the extension, with a file for each thing the package leaves out.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  const put = (name, text) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  };
  put('manifest.json', JSON.stringify(MANIFEST));
  put('sw.js', 'chrome.runtime.onInstalled.addListener(() => {});\n'.repeat(60));
  put('icons/i.png', 'png');
  for (const name of LICENSES) put(name, 'licence');
  for (const name of ['notes.md', 'sw.test.js', 'package.json', 'docs/guide.txt', 'vendor/SHA256SUMS']) put(name, 'left out');
  return { dir, put };
}

const run = (dir) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });

test('package: the zip holds the runtime files and nothing else, and the SHA-256 it prints is the one of the file', () => {
  const { dir } = fixture();
  try {
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    const zip = readFileSync(join(dir, 'dist', 'oblitero-1.2.3.zip'));
    assert.ok(result.stdout.includes(`SHA-256: ${createHash('sha256').update(zip).digest('hex')}`));
    const entries = readZip(zip);
    assert.deepEqual(entries.map((entry) => entry.path), ['icons/i.png', 'manifest.json', 'sw.js', ...LICENSES].sort());
    assert.equal(entries.find((entry) => entry.path === 'manifest.json').data.toString(), JSON.stringify(MANIFEST));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('package: a missing license, or a file the manifest names that is not there, stops the build', () => {
  const cases = [
    { missing: 'vendor/qpdf/LICENSE_QPDF', message: /License missing from the package: vendor\/qpdf\/LICENSE_QPDF/ },
    { missing: 'icons/i.png', message: /cited by the manifest are missing from the package: icons\/i\.png/ },
  ];
  for (const { missing, message } of cases) {
    const { dir } = fixture();
    try {
      rmSync(join(dir, missing));
      const result = run(dir);
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('package: a file git does not track is not packaged by surprise', () => {
  const { dir, put } = fixture();
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });
    assert.equal(run(dir).status, 0);
    put('scratch.js', 'left behind');
    const result = run(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /would be packaged: scratch\.js/);
    execFileSync('git', ['add', 'scratch.js'], { cwd: dir });
    assert.equal(run(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
