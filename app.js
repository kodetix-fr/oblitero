import { initMerge } from './merge-view.js';
import { initPages } from './pages-view.js';

const merge = initMerge();
const pages = initPages();

const tabs = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[role="tab"]')));
const handlers = { 'tab-merge': (files) => merge.addFiles(files), 'tab-pages': (files) => pages.open(files[0]) };

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
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    select(next);
    next.focus();
  });
});

document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', async (event) => {
  event.preventDefault();
  const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
  await handlers[active.id](Array.from(event.dataTransfer.files));
});
