import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_ASKS, NEWS_FOR, REVIEW_STEP, askClosed, askShown, cleanNotice, downloaded, hasNews, installed, minorBefore, minorOf, newsSeen, shouldAsk,
} from './about-pure.js';
import en from './locales/en.js';

const manifest = JSON.parse(readFileSync(new URL('manifest.json', import.meta.url), 'utf8'));
const fresh = cleanNotice(undefined);

test('the news are about the release line of the manifest: a new minor release rewrites them', () => {
  assert.equal(minorOf(manifest.version), NEWS_FOR);
  assert.ok(en['about.news'].length > 20);
});

test('minorOf keeps major and minor, and nothing else is a version', () => {
  assert.equal(minorOf('0.2.1'), '0.2');
  assert.equal(minorOf('1.10.0'), '1.10');
  for (const bad of [undefined, null, 5, '', '0.2', '0.2.1.4', '0.2.x', '1.2.3-beta']) assert.equal(minorOf(bad), null, String(bad));
});

test('a minor release is before another when its major or its minor is lower, a patch never is', () => {
  assert.equal(minorBefore('0.1.0', '0.2.0'), true);
  assert.equal(minorBefore('0.9.5', '0.10.0'), true);
  assert.equal(minorBefore('0.9.0', '1.0.0'), true);
  assert.equal(minorBefore('0.2.0', '0.2.9'), false);
  assert.equal(minorBefore('0.2.1', '0.1.0'), false);
  assert.equal(minorBefore(null, '0.2.0'), false);
});

test('cleanNotice starts from nothing, and garbage falls back to that; "never" is kept', () => {
  assert.deepEqual(fresh, { seen: null, downloads: 0, asked: 0, next: REVIEW_STEP });
  assert.deepEqual(cleanNotice({ seen: 'x', downloads: -1, asked: 'a', next: 'soon' }), fresh);
  assert.deepEqual(cleanNotice({ downloads: 1.5, asked: 9 }), { ...fresh, asked: MAX_ASKS });
  assert.equal(cleanNotice({ next: null }).next, null);
  assert.deepEqual(cleanNotice('text'), fresh);
});

test('a first install has no news, an update from an older line has, a stored state is kept', () => {
  assert.equal(hasNews(installed(fresh, '0.2.1', { reason: 'install' }), '0.2.1'), false);
  assert.equal(hasNews(installed(fresh, '0.2.1', { reason: 'update', previousVersion: '0.1.4' }), '0.2.1'), true);
  assert.equal(hasNews(installed(fresh, '0.2.1', { reason: 'update', previousVersion: '0.2.0' }), '0.2.1'), false);
  assert.equal(installed({ ...fresh, seen: '0.1.0' }, '0.2.1', { reason: 'update', previousVersion: '0.1.9' }).seen, '0.1.0');
  assert.equal(hasNews(fresh, '0.2.1'), false, 'no state at all: nothing to say');
  assert.equal(hasNews(newsSeen({ ...fresh, seen: '0.1.0' }, '0.2.1'), '0.2.1'), false);
});

test('the request comes after REVIEW_STEP downloads, once more if ignored, never after an answer', () => {
  let n = fresh;
  for (let i = 0; i < REVIEW_STEP - 1; i++) n = downloaded(n);
  assert.equal(shouldAsk(n), false);
  n = askShown(downloaded(n));
  assert.equal(shouldAsk(n), false);
  for (let i = 0; i < REVIEW_STEP; i++) n = downloaded(n);
  assert.equal(shouldAsk(n), true);
  n = askShown(n);
  assert.equal(n.next, null, 'twice at most');
  assert.equal(shouldAsk(askClosed(downloaded(downloaded(fresh)))), false);
});
