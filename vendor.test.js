import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VENDOR = new URL('./vendor/', import.meta.url).pathname;
const OUT_OF_LIST = new Set(['README.md', 'SHA256SUMS']);

const filesOf = (folder, rel = '') =>
  readdirSync(join(folder, rel), { withFileTypes: true }).flatMap((entry) => {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return filesOf(folder, path);
    return OUT_OF_LIST.has(path) ? [] : [path];
  });

test('vendor/SHA256SUMS lists every vendored file with the hash it has now', () => {
  const listed = new Map(readFileSync(join(VENDOR, 'SHA256SUMS'), 'utf8').trim().split('\n').map((line) => {
    const [, hash, path] = /^([0-9a-f]{64}) {2}(.+)$/.exec(line) ?? assert.fail(`not a line of sha256sum: ${line}`);
    return [path, hash];
  }));
  const present = filesOf(VENDOR);
  assert.deepEqual(present.filter((path) => !listed.has(path)), [], 'files that SHA256SUMS does not list');
  assert.deepEqual([...listed.keys()].filter((path) => !present.includes(path)), [], 'files that SHA256SUMS lists and that are gone');
  const changed = present.filter((path) => createHash('sha256').update(readFileSync(join(VENDOR, path))).digest('hex') !== listed.get(path));
  assert.deepEqual(changed, [], 'vendored files that are not the ones whose hash was recorded');
});
