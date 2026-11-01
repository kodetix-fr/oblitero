import { pageSize, renderPage } from './render.js';
import { byId } from './dom.js';

const MIN_SIZE = 0.004;
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

  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  const scale = Math.min(Math.max(window.innerWidth - 96, 200) / width, Math.max(window.innerHeight - 260, 200) / height);
  stage.style.width = `${width * scale}px`;
  stage.style.height = `${height * scale}px`;
  await renderPage(doc, entry.source, entry.rotation, canvas, scale * devicePixelRatio);

  let rectangles = entry.redactions.slice();
  let result = null;
  const session = new AbortController();
  const { signal } = session;

  function draw() {
    layer.replaceChildren(
      ...rectangles.map((rectangle) => {
        const box = document.createElement('span');
        box.className = 'box';
        place(box, rectangle);
        return box;
      }),
    );
    undo.disabled = rectangles.length === 0;
    clear.disabled = rectangles.length === 0;
  }

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
