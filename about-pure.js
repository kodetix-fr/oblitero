// What Oblitero keeps on this computer about itself: the last version whose news was seen, and how many results were
// downloaded since the request for a review (asked at most twice, never again after an answer). A bare number and a
// version: nothing about a file. No DOM, no storage.

/** The minor release that the text 'about.news' of the locales talks about (the line of the manifest version). */
export const NEWS_FOR = '0.2';

export const REVIEW_STEP = 5; // downloads before the first request, and between two
export const MAX_ASKS = 2;

/** @typedef {{ seen: string | null, downloads: number, asked: number, next: number | null }} Notice */

const VERSION = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;

/** "0.2" for "0.2.1", null for anything that is not a version. @param {unknown} version @returns {string | null} */
export function minorOf(version) {
  const m = typeof version === 'string' ? VERSION.exec(version) : null;
  return m ? `${Number(m[1])}.${Number(m[2])}` : null;
}

/** Is the minor release of `a` older than that of `b`? False when either is not a version. @param {unknown} a @param {unknown} b */
export function minorBefore(a, b) {
  const [x, y] = [minorOf(a), minorOf(b)];
  if (!x || !y) return false;
  const [xa, xb] = x.split('.').map(Number);
  const [ya, yb] = y.split('.').map(Number);
  return xa < ya || (xa === ya && xb < yb);
}

const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1e6 ? v : null);

/**
 * What was stored, made safe: anything unknown or out of range falls back to the start. `next: null` is kept: it means "never".
 * @param {unknown} raw @returns {Notice}
 */
export function cleanNotice(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    seen: typeof r.seen === 'string' && minorOf(r.seen) ? r.seen : null,
    downloads: count(r.downloads) ?? 0,
    asked: Math.min(count(r.asked) ?? 0, MAX_ASKS),
    next: r.next === null ? null : (count(r.next) ?? REVIEW_STEP),
  };
}

/**
 * After an install or an update: a first install has nothing new to read, and an update from a version that kept no state
 * starts from the version it came from.
 * @param {Notice} n @param {string} current @param {{ reason?: string, previousVersion?: string }} details of chrome.runtime.onInstalled
 * @returns {Notice}
 */
export function installed(n, current, { reason, previousVersion } = {}) {
  if (reason === 'install') return { ...n, seen: current };
  if (reason === 'update' && !n.seen) return { ...n, seen: minorOf(previousVersion) ? /** @type {string} */ (previousVersion) : current };
  return n;
}

/** @param {Notice} n @param {string} current */
export const hasNews = (n, current) => minorOf(current) === NEWS_FOR && minorBefore(n.seen, current);

/** @param {Notice} n @param {string} current @returns {Notice} */
export const newsSeen = (n, current) => (minorOf(current) ? { ...n, seen: current } : n);

/** @param {Notice} n @returns {Notice} */
export const downloaded = (n) => ({ ...n, downloads: Math.min(n.downloads + 1, 1e6) });

/** @param {Notice} n */
export const shouldAsk = (n) => n.next !== null && n.downloads >= n.next;

/** The request was shown, answered or not: an ignored request comes back once, REVIEW_STEP downloads later. @param {Notice} n @returns {Notice} */
export function askShown(n) {
  const asked = Math.min(n.asked + 1, MAX_ASKS);
  return { ...n, asked, next: asked >= MAX_ASKS ? null : n.downloads + REVIEW_STEP };
}

/** The review was given, or refused for good. @param {Notice} n @returns {Notice} */
export const askClosed = (n) => ({ ...n, next: null });
