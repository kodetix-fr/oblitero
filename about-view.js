// The About dialog, the dot that says there is news to read, and the one-row request for a review in the app bar.
import { byId } from './dom.js';
import { t } from './i18n.js';
import { NEWS_FOR, minorOf } from './about-pure.js';
import { closeReviewAsk, markNewsSeen, newsPending, takeReviewAsk } from './about.js';

const version = chrome.runtime.getManifest().version;
const report = (error) => console.error('Oblitero:', error);

function showDot(on) {
  byId('about-dot').hidden = !on;
  const button = byId('about-open');
  if (on) button.setAttribute('aria-describedby', 'about-new');
  else button.removeAttribute('aria-describedby');
}

const showAsk = (on) => {
  if (on) byId('ask').hidden = false;
};

function closeAsk() {
  byId('ask').hidden = true;
  closeReviewAsk().catch(report);
}

export function initAbout() {
  const dialog = byId('about-dialog');
  byId('about-open').addEventListener('click', () => {
    byId('about-version').textContent = t('about.version', { v: version });
    byId('about-news').hidden = minorOf(version) !== NEWS_FOR;
    dialog.showModal();
    showDot(false);
    markNewsSeen().catch(report);
  });
  byId('about-close').addEventListener('click', () => dialog.close());
  byId('ask-review').addEventListener('click', closeAsk);
  byId('ask-never').addEventListener('click', closeAsk);
  newsPending().then(showDot, report);
  takeReviewAsk().then(showAsk, report);
}

/** A result was downloaded: one more for the count behind the request for a review. */
export const noteDownload = () => takeReviewAsk(true).then(showAsk, report);
