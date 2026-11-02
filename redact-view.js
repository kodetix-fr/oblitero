import { pageSize, renderPage } from './render.js';
import { byId } from './dom.js';
import { plural, t } from './i18n.js';

const MIN_SIZE = 0.004;
const STEP = 0.01;
const BIG_STEP = 0.05;
const clamp = (value) => Math.min(1, Math.max(0, value));

function place(element, { x, y, w, h }) {
  Object.assign(element.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
}

// Resolves with the rectangles (fractions of the displayed page) when the user is done, null when they cancel.
export async function openRedactor(doc, entry) {
  const dialog = byId('redact-dialog');
  const stage = byId('redact-stage');
  const canvas = byId('redact-canvas');
  const layer = byId('redact-layer');
  const undo = byId('redact-undo');
  const clear = byId('redact-clear');
  const count = byId('redact-count');
  const live = byId('redact-live');

  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  const scale = Math.min(Math.max(Math.min(928, window.innerWidth - 64), 200) / width, Math.max(window.innerHeight - 280, 200) / height);
  stage.style.width = `${width * scale}px`;
  stage.style.height = `${height * scale}px`;
  await renderPage(doc, entry.source, entry.rotation, canvas, scale * devicePixelRatio);

  let rectangles = entry.redactions.slice();
  let result = null;
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
    count.textContent = rectangles.length ? plural(rectangles.length, 'count.rectangle.one', 'count.rectangle.other') : '';
    if (focusIndex !== null) /** @type {HTMLElement | undefined} */ (layer.children[focusIndex])?.focus();
  }

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  function onLayerKey(event) {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? BIG_STEP : STEP;
      cursor = { x: clamp(cursor.x + arrow[0] * step), y: clamp(cursor.y + arrow[1] * step) };
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
          rectangles.push(made);
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
        const w = Math.min(1 - rectangle.x, Math.max(MIN_SIZE, rectangle.w + arrow[0] * STEP));
        const h = Math.min(1 - rectangle.y, Math.max(MIN_SIZE, rectangle.h + arrow[1] * STEP));
        rectangles[index] = { ...rectangle, w, h };
      } else {
        rectangles[index] = { ...rectangle, x: Math.min(1 - rectangle.w, Math.max(0, rectangle.x + arrow[0] * STEP)), y: Math.min(1 - rectangle.h, Math.max(0, rectangle.y + arrow[1] * STEP)) };
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
      const point = (e) => ({ x: clamp((e.clientX - bounds.left) / bounds.width), y: clamp((e.clientY - bounds.top) / bounds.height) });
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
        if (made && made.w >= MIN_SIZE && made.h >= MIN_SIZE) rectangles.push(made);
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
  byId('redact-cancel').addEventListener('click', () => dialog.close(), { signal });
  byId('redact-done').addEventListener(
    'click',
    () => {
      result = rectangles;
      dialog.close();
    },
    { signal },
  );

  draw();
  return new Promise((resolve) => {
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
