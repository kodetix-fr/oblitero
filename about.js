// The state of about-pure.js in IndexedDB, shared by the page and the service worker (no permission needed). Nothing here is sent anywhere.
import { askClosed, askShown, cleanNotice, downloaded, hasNews, installed, newsSeen, shouldAsk } from './about-pure.js';

const KEY = 'about';
const version = () => chrome.runtime.getManifest().version;

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('oblitero', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** One read and write in one transaction, so that two tabs never lose each other's change. @param {(n: import('./about-pure.js').Notice) => import('./about-pure.js').Notice} change */
async function update(change) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      let next;
      const get = store.get(KEY);
      get.onsuccess = () => {
        next = change(cleanNotice(get.result));
        store.put(next, KEY);
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const newsPending = async () => hasNews(await update((n) => n), version());

export const markNewsSeen = () => update((n) => newsSeen(n, version()));

/** @param {{ reason?: string, previousVersion?: string }} details of chrome.runtime.onInstalled */
export const noteInstalled = (details) => update((n) => installed(n, version(), details));

/** Counts a download when `count`, and says whether to ask for a review now; when it does, the request counts as shown. */
export async function takeReviewAsk(count = false) {
  let ask = false;
  await update((n) => {
    const m = count ? downloaded(n) : n;
    ask = shouldAsk(m);
    return ask ? askShown(m) : m;
  });
  return ask;
}

export const closeReviewAsk = () => update(askClosed);
