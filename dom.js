import { getLanguage, t } from './i18n.js';

const SVG = 'http://www.w3.org/2000/svg';

export const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export const byId = (id) => /** @type {any} */ (document.getElementById(id));
export const query = (selector) => /** @type {any} */ (document.querySelector(selector));

export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export function iconButton(name, label, onClick, disabled = false, title = label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'btn ghost icon';
  element.title = title;
  element.setAttribute('aria-label', label);
  element.disabled = disabled;
  element.append(icon(name));
  element.addEventListener('click', onClick);
  return element;
}

// The scale at which a page fits a dialog that keeps `reserved` pixels of the window's height for itself.
export const fitScale = (width, height, reserved) => Math.min(Math.max(Math.min(928, window.innerWidth - 64), 200) / width, Math.max(window.innerHeight - reserved, 200) / height);

export const unreadablePage = () => Object.assign(document.createElement('p'), { className: 'state-note', textContent: t('preview.unreadable') });

// Opens a modal dialog and resolves with what `wire` passes to `finish`, or null when it is cancelled. The listeners `wire` adds
// with `signal` go away when the dialog closes.
/** @param {any} dialog @param {string} cancelId @param {(finish: (value: any) => void, signal: AbortSignal) => void} wire */
export function askDialog(dialog, cancelId, wire) {
  return new Promise((resolve) => {
    const session = new AbortController();
    let result = null;
    byId(cancelId).addEventListener('click', () => dialog.close(), { signal: session.signal });
    wire((value) => {
      result = value;
      dialog.close();
    }, session.signal);
    dialog.addEventListener(
      'close',
      () => {
        session.abort();
        resolve(result);
      },
      { once: true },
    );
    dialog.showModal();
  });
}

export function copyCanvas(source) {
  if (!source) return null;
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d').drawImage(source, 0, 0);
  return copy;
}

// The entry of `container` nearest to the pointer and the side of it the pointer is on (`after`), or null. The entries of
// `blocked` (ids) never count, and a pointer over one of them has no target at all.
export function nearestEntry(container, entry, idOf, event, axis, blocked = new Set()) {
  let best = null;
  for (const element of container.querySelectorAll(entry)) {
    const box = element.getBoundingClientRect();
    const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right);
    const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom);
    const isBlocked = blocked.has(idOf(element));
    if (isBlocked && dx === 0 && dy === 0) return null;
    if (isBlocked) continue;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { element, box, distance };
  }
  if (!best) return null;
  const after = axis === 'y' ? event.clientY > best.box.top + best.box.height / 2 : event.clientX > best.box.left + best.box.width / 2;
  return { element: best.element, id: idOf(best.element), after };
}

// Lets the entries of `container` (elements that match `entry`, each with draggable=true) be dragged to a new place
// among them. The drop lands before or after the entry NEAREST to the pointer, so the gaps between entries and the
// empty space after the last one count too; over the dragged entries themselves there is no target.
// `group(id)` is the set of ids that travel together; `onMove(ids, targetId, after)` is called on the drop.
/**
 * @param {HTMLElement} container
 * @param {{ entry: string, idOf: (element: any) => number, axis: 'x' | 'y', state: { source: number | null, group: Set<number> },
 *   group?: (id: number) => Set<number>, ghost?: (event: DragEvent, group: Set<number>) => void,
 *   onMove: (ids: Set<number>, targetId: number, after: boolean) => void }} options
 */
export function sortable(container, { entry, idOf, axis, state, group = (id) => new Set([id]), ghost, onMove }) {
  const clearMarks = () => {
    document.querySelectorAll('[data-drop]').forEach((element) => element.removeAttribute('data-drop'));
    document.querySelectorAll('.dragging').forEach((element) => element.classList.remove('dragging'));
  };

  const target = (event) => nearestEntry(container, entry, idOf, event, axis, state.group);

  container.addEventListener('dragstart', (event) => {
    const element = /** @type {Element} */ (event.target).closest?.(entry);
    if (!element || !container.contains(element)) return;
    state.source = idOf(element);
    state.group = group(state.source);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(state.source));
    ghost?.(event, state.group);
    setTimeout(() => {
      for (const other of container.querySelectorAll(entry)) if (state.group.has(idOf(other))) other.classList.add('dragging');
    });
  });
  container.addEventListener('dragend', () => {
    state.source = null;
    state.group = new Set();
    clearMarks();
  });
  container.addEventListener('dragover', (event) => {
    if (state.source === null) return;
    const hit = target(event);
    document.querySelectorAll('[data-drop]').forEach((element) => element.removeAttribute('data-drop'));
    if (!hit) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    hit.element.dataset.drop = hit.after ? 'after' : 'before';
  });
  container.addEventListener('dragleave', (event) => {
    if (!container.contains(/** @type {Node} */ (event.relatedTarget))) document.querySelectorAll('[data-drop]').forEach((element) => element.removeAttribute('data-drop'));
  });
  container.addEventListener('drop', (event) => {
    if (state.source === null) return;
    const hit = target(event);
    const moving = state.group;
    state.source = null;
    state.group = new Set();
    clearMarks();
    if (!hit) return;
    event.preventDefault();
    onMove(moving, hit.id, hit.after);
  });
}

const MARKED = '[data-i18n],[data-i18n-title],[data-i18n-aria],[data-i18n-placeholder]';

// An element carries its key in a data attribute, so that a language change translates the whole page again:
// data-i18n the text, data-i18n-title the tooltip, data-i18n-aria the aria-label, data-i18n-placeholder the placeholder.
// Sets the text of `element` from a key and remembers it for the next language change.
export function setI18n(element, key) {
  element.dataset.i18n = key;
  element.textContent = t(key);
}

export function applyDom(root = document) {
  document.documentElement.lang = getLanguage();
  for (const element of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(MARKED))) {
    const { i18n, i18nTitle, i18nAria, i18nPlaceholder } = element.dataset;
    if (i18n) element.textContent = t(i18n);
    if (i18nTitle) element.title = t(i18nTitle);
    if (i18nAria) element.setAttribute('aria-label', t(i18nAria));
    if (i18nPlaceholder) element.setAttribute('placeholder', t(i18nPlaceholder));
  }
}
