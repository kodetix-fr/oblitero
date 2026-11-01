import { initMerge } from './merge-view.js';
import { initPages } from './pages-view.js';
import { initImages } from './images-view.js';
import { initCompress } from './compress-view.js';
import { byId } from './dom.js';

const merge = initMerge();
const pages = initPages();
const compress = initCompress();
const images = initImages({
  openInPages: async (file) => {
    select(document.getElementById('tab-pages'));
    await pages.open(file);
  },
});

const tabs = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[role="tab"]')));
const tools = {
  'tab-merge': { add: (files) => merge.addFiles(files), hint: () => 'Drop PDF files to add them' },
  'tab-compress': { add: (files) => compress.open(files[0]), hint: () => 'Drop a PDF to compress it' },
  'tab-images': { add: (files) => images.addFiles(files), hint: () => 'Drop images to add them' },
  'tab-pages': { add: (files, event) => pages.drop(files, event), hint: () => (pages.hasDocument() ? 'Drop a PDF to insert its pages there' : 'Drop a PDF to open it') },
};

const activeTab = () => tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');

function select(tab) {
  for (const other of tabs) {
    const active = other === tab;
    other.setAttribute('aria-selected', String(active));
    other.tabIndex = active ? 0 : -1;
    document.getElementById(other.getAttribute('aria-controls')).hidden = !active;
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => select(tab));
  tab.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    select(next);
    next.focus();
  });
});

// Files dragged in from outside: the page takes the drop (else the browser would open the file and leave the app), and a
// box says so. Dragging a card inside the page carries no file, so it never gets here.
const dragsFiles = (/** @type {DragEvent} */ event) => !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
const hint = byId('dropHint');
const showHint = (on) => {
  hint.hidden = !on;
  if (on) hint.firstElementChild.textContent = tools[activeTab().id].hint();
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
  await tools[activeTab().id].add(Array.from(event.dataTransfer.files), event);
});
