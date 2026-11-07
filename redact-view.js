import { pageSize, renderPage } from './render.js';
import { ARROWS, askDialog, byId, fitScale, setI18n } from './dom.js';
import { clamp } from './math.js';
import { plural, t } from './i18n.js';

const MIN_SIZE = 0.004;
const STEP = 0.01;
const BIG_STEP = 0.05;
const inPage = (value) => clamp(value, 0, 1);

function place(element, { x, y, w, h }) {
  Object.assign(element.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
}

// Resolves with the rectangles (fractions of the displayed page) when the user is done, null when they cancel. With `crop`, the
// page holds one rectangle, and the dialog resolves with { rect, remove }, `rect` being null when there is none.
export async function openRedactor(doc, entry, { crop = false } = {}) {
  const dialog = byId('redact-dialog');
  const stage = byId('redact-stage');
  const canvas = byId('redact-canvas');
  const layer = byId('redact-layer');
  const undo = byId('redact-undo');
  const clear = byId('redact-clear');
  const count = byId('redact-count');
  const live = byId('redact-live');

  const remove = /** @type {HTMLInputElement} */ (byId('crop-remove'));
  dialog.dataset.mode = crop ? 'crop' : 'redact';
  setI18n(byId('redact-title'), crop ? 'crop.title' : 'redact.redact-title');
  setI18n(byId('redact-hint'), crop ? 'crop.hint' : 'redact.drag-on-the-page');
  byId('redact-icon').setAttribute('href', crop ? '#i-crop' : '#i-redact');
  byId('crop-remove-field').hidden = !crop;
  remove.checked = !!entry.crop?.remove;

  // Rectangles are fractions of the whole page, whatever its crop.
  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  const scale = fitScale(width, height, 280);
  stage.style.width = `${width * scale}px`;
  stage.style.height = `${height * scale}px`;
  await renderPage(doc, entry.source, entry.rotation, canvas, scale * devicePixelRatio, { ...entry, crop: null });

  let rectangles = crop ? (entry.crop ? [{ x: entry.crop.x, y: entry.crop.y, w: entry.crop.w, h: entry.crop.h }] : []) : entry.redactions.slice();
  const add = (made) => {
    rectangles = crop ? [made] : [...rectangles, made];
  };
  const session = new AbortController();
  const { signal } = session;

  // The keyboard works on the same rectangles: a crosshair moves with the arrow keys, Enter starts a rectangle and Enter again
  // places it, then Tab goes through the rectangles, which move with the arrows, resize with Shift and the arrows, and go with Delete.
  let cursor = { x: 0.5, y: 0.5 };
  let anchor = null;
  let focusIndex = null;
  const say = (text) => {
    live.textContent = text;
  };
  const between = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  function draw() {
    const nodes = rectangles.map((rectangle, index) => {
      const box = document.createElement('span');
      box.className = 'box';
      box.tabIndex = 0;
      box.setAttribute('role', 'button');
      box.setAttribute('aria-label', t('redact.box-aria', { n: index + 1, total: rectangles.length }));
      box.dataset.index = String(index);
      place(box, rectangle);
      return box;
    });
    if (anchor) {
      const draft = document.createElement('span');
      draft.className = 'box draft';
      place(draft, between(anchor, cursor));
      nodes.push(draft);
    }
    const crosshair = document.createElement('span');
    crosshair.className = 'crosshair';
    Object.assign(crosshair.style, { left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` });
    nodes.push(crosshair);
    layer.replaceChildren(...nodes);
    undo.disabled = rectangles.length === 0;
    clear.disabled = rectangles.length === 0;
    count.textContent = rectangles.length && !crop ? plural(rectangles.length, 'count.rectangle.one', 'count.rectangle.other') : '';
    if (focusIndex !== null) /** @type {HTMLElement | undefined} */ (layer.children[focusIndex])?.focus();
  }

  function onLayerKey(event) {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? BIG_STEP : STEP;
      cursor = { x: inPage(cursor.x + arrow[0] * step), y: inPage(cursor.y + arrow[1] * step) };
      focusIndex = null;
      draw();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      focusIndex = null;
      if (!anchor) {
        anchor = { ...cursor };
        say(t('redact.say-started'));
      } else {
        const made = between(anchor, cursor);
        anchor = null;
        if (made.w >= MIN_SIZE && made.h >= MIN_SIZE) {
          add(made);
          focusIndex = rectangles.length - 1;
          say(t('redact.say-added', { n: rectangles.length }));
        } else {
          say(t('redact.say-small'));
        }
      }
      draw();
    } else if (event.key === 'Escape' && anchor) {
      event.preventDefault();
      event.stopPropagation();
      anchor = null;
      say(t('redact.say-cancelled'));
      draw();
    }
  }

  function onBoxKey(event, index) {
    const rectangle = rectangles[index];
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      if (event.shiftKey) {
        const w = clamp(rectangle.w + arrow[0] * STEP, MIN_SIZE, 1 - rectangle.x);
        const h = clamp(rectangle.h + arrow[1] * STEP, MIN_SIZE, 1 - rectangle.y);
        rectangles[index] = { ...rectangle, w, h };
      } else {
        rectangles[index] = { ...rectangle, x: clamp(rectangle.x + arrow[0] * STEP, 0, 1 - rectangle.w), y: clamp(rectangle.y + arrow[1] * STEP, 0, 1 - rectangle.h) };
      }
      focusIndex = index;
      draw();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      rectangles = rectangles.filter((_, other) => other !== index);
      focusIndex = rectangles.length ? Math.min(index, rectangles.length - 1) : null;
      say(t('redact.say-removed', { n: rectangles.length }));
      draw();
      if (focusIndex === null) layer.focus();
    }
  }

  layer.addEventListener(
    'keydown',
    (event) => {
      const box = /** @type {HTMLElement | null | undefined} */ (/** @type {HTMLElement} */ (event.target).closest?.('.box:not(.draft)'));
      if (box && layer.contains(box)) onBoxKey(event, Number(box.dataset.index));
      else if (event.target === layer) onLayerKey(event);
    },
    { signal },
  );
  layer.addEventListener('pointerdown', () => {
    focusIndex = null;
  }, { signal });

  layer.addEventListener(
    'pointerdown',
    (event) => {
      const bounds = layer.getBoundingClientRect();
      const point = (e) => ({ x: inPage((e.clientX - bounds.left) / bounds.width), y: inPage((e.clientY - bounds.top) / bounds.height) });
      const from = point(event);
      const spanTo = (to) => ({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) });
      const draft = document.createElement('span');
      draft.className = 'box draft';
      layer.append(draft);
      layer.setPointerCapture(event.pointerId);

      const gesture = new AbortController();
      const options = { signal: gesture.signal };
      const finish = (made) => {
        gesture.abort();
        if (made && made.w >= MIN_SIZE && made.h >= MIN_SIZE) add(made);
        draw();
      };
      layer.addEventListener('pointermove', (e) => place(draft, spanTo(point(e))), options);
      layer.addEventListener('pointerup', (e) => finish(spanTo(point(e))), options);
      layer.addEventListener('pointercancel', () => finish(null), options);
    },
    { signal },
  );
  undo.addEventListener(
    'click',
    () => {
      rectangles = rectangles.slice(0, -1);
      draw();
    },
    { signal },
  );
  clear.addEventListener(
    'click',
    () => {
      rectangles = [];
      draw();
    },
    { signal },
  );
  draw();
  return askDialog(dialog, 'redact-cancel', (finish, closed) => {
    closed.addEventListener('abort', () => session.abort());
    byId('redact-done').addEventListener('click', () => finish(crop ? { rect: rectangles[0] ?? null, remove: remove.checked } : rectangles), { signal: closed });
  });
}
