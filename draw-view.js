import { entrySize, paintEntry, paintShape } from './render.js';
import { ARROWS, askDialog, byId, fitScale } from './dom.js';
import { clamp } from './math.js';
import { shapeMark } from './marks.js';
import { t } from './i18n.js';

const MIN_LENGTH = 0.01;
const STEP = 0.01;
const BIG_STEP = 0.05;
const inPage = (value) => clamp(value, 0, 1);

// Resolves with the shapes of the page once the user is done (those it had, and the new ones), or null when they cancel. The
// page is shown whole, with its other marks.
export async function openDrawing(doc, entry) {
  const dialog = byId('draw-dialog');
  const stage = byId('draw-stage');
  const canvas = /** @type {HTMLCanvasElement} */ (byId('draw-canvas'));
  const overlay = /** @type {HTMLCanvasElement} */ (byId('draw-overlay'));
  const layer = byId('draw-layer');
  const crosshair = byId('draw-crosshair');
  const live = byId('draw-live');
  const undo = byId('draw-undo');
  const clear = byId('draw-clear');
  const color = /** @type {HTMLSelectElement} */ (byId('draw-color'));
  const tool = () => /** @type {HTMLInputElement} */ (dialog.querySelector('input[name="draw-tool"]:checked')).value;

  const whole = { ...entry, crop: null, marks: entry.marks.filter((mark) => mark.kind !== 'shape') };
  const shown = await entrySize(doc, whole);
  const scale = fitScale(shown.width, shown.height, 280);
  stage.style.width = `${shown.width * scale}px`;
  stage.style.height = `${shown.height * scale}px`;
  const page = await paintEntry(doc, whole, scale * devicePixelRatio, true);
  canvas.width = overlay.width = page.width;
  canvas.height = overlay.height = page.height;
  canvas.getContext('2d').drawImage(page, 0, 0);

  let shapes = entry.marks.filter((mark) => mark.kind === 'shape');
  let draft = null;
  let cursor = { x: 0.5, y: 0.5 };
  const make = (from, to) => shapeMark(tool(), from.x, from.y, to.x, to.y, color.value);
  const say = (key) => {
    live.textContent = t(key, { n: shapes.length });
  };

  function draw() {
    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);
    for (const shape of draft ? [...shapes, draft] : shapes) paintShape(context, shape, overlay.width, overlay.height);
    Object.assign(crosshair.style, { left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` });
    undo.disabled = shapes.length === 0;
    clear.disabled = shapes.length === 0;
  }

  const keep = (shape) => {
    draft = null;
    if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) < MIN_LENGTH) return say('draw.say-small');
    shapes = [...shapes, shape];
    say('draw.say-added');
  };

  const session = new AbortController();
  const { signal } = session;
  let anchor = null;
  layer.addEventListener(
    'keydown',
    (event) => {
      const arrow = ARROWS[event.key];
      if (arrow) {
        event.preventDefault();
        const step = event.shiftKey ? BIG_STEP : STEP;
        cursor = { x: inPage(cursor.x + arrow[0] * step), y: inPage(cursor.y + arrow[1] * step) };
        if (anchor) draft = make(anchor, cursor);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (anchor) {
          keep(make(anchor, cursor));
          anchor = null;
        } else {
          anchor = { ...cursor };
          say('draw.say-started');
        }
      } else if (event.key === 'Escape' && anchor) {
        event.preventDefault();
        event.stopPropagation();
        anchor = null;
        draft = null;
      } else {
        return;
      }
      draw();
    },
    { signal },
  );
  layer.addEventListener(
    'pointerdown',
    (event) => {
      const bounds = layer.getBoundingClientRect();
      const point = (e) => ({ x: inPage((e.clientX - bounds.left) / bounds.width), y: inPage((e.clientY - bounds.top) / bounds.height) });
      const from = point(event);
      layer.setPointerCapture(event.pointerId);
      const gesture = new AbortController();
      const options = { signal: gesture.signal };
      layer.addEventListener('pointermove', (e) => {
        draft = make(from, point(e));
        draw();
      }, options);
      layer.addEventListener('pointerup', (e) => {
        gesture.abort();
        keep(make(from, point(e)));
        draw();
      }, options);
      layer.addEventListener('pointercancel', () => {
        gesture.abort();
        draft = null;
        draw();
      }, options);
    },
    { signal },
  );
  undo.addEventListener('click', () => ((shapes = shapes.slice(0, -1)), draw()), { signal });
  clear.addEventListener('click', () => ((shapes = []), draw()), { signal });
  draw();
  return askDialog(dialog, 'draw-cancel', (finish, closed) => {
    closed.addEventListener('abort', () => session.abort());
    byId('draw-done').addEventListener('click', () => finish(shapes), { signal: closed });
    queueMicrotask(() => layer.focus());
  });
}
