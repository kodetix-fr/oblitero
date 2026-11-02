import { applyDom, byId, setI18n } from './dom.js';
import { LANGUAGES, loadLanguage, resolveLanguage, setLanguage, t } from './i18n.js';
import { initPages } from './pages-view.js';

const STORAGE_KEY = 'oblitero-language';

function savedSetting() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'auto';
  } catch {
    return 'auto';
  }
}

function saveSetting(value) {
  try {
    if (value === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return false;
  }
  return true;
}

const useLanguage = async (setting) => setLanguage(await loadLanguage(resolveLanguage(setting, chrome.i18n.getUILanguage())));

await useLanguage(savedSetting());
applyDom();
const pages = initPages();

const picker = byId('language');
picker.replaceChildren(
  ...['auto', ...Object.keys(LANGUAGES)].map((value) => {
    const option = Object.assign(document.createElement('option'), { value });
    if (value === 'auto') setI18n(option, 'language.auto');
    else option.textContent = LANGUAGES[value];
    return option;
  }),
);
picker.value = savedSetting();
picker.addEventListener('change', async () => {
  saveSetting(picker.value);
  await useLanguage(picker.value);
  applyDom();
  pages.retranslate();
});

// Files dragged in from outside: the page takes the drop (else the browser would open the file and leave the app), and a
// box says so. Dragging a card inside the page carries no file, so it never gets here.
const dragsFiles = (/** @type {DragEvent} */ event) => !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
const hint = byId('dropHint');
const showHint = (on) => {
  hint.hidden = !on;
  if (on) hint.firstElementChild.textContent = t(pages.hasDocument() ? 'drop.add' : 'drop.start');
};

addEventListener('dragover', (event) => {
  if (!dragsFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  showHint(true);
});
addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) showHint(false);
});
addEventListener('drop', async (event) => {
  if (!dragsFiles(event)) return;
  event.preventDefault();
  showHint(false);
  await pages.drop(Array.from(event.dataTransfer.files), event);
});
