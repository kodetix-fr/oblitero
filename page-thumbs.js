import { entrySize, renderPage } from './render.js';

const GRID_BOX = { width: 150, height: 220 };
export const ROW_BOX = { width: 40, height: 52 };
const THUMB_QUALITY = 1.75;

// The thumbnails of the pages, drawn one at a time when they come into view, each to fit a box. `docOf(file)` gives the open
// PDF of a file.
export function createThumbs(docOf) {
  const thumbs = new Map();
  let generation = 0;
  let renders = Promise.resolve();
  const baseOf = (page) => `${generation}:${page.id}:${page.rotation}:${page.angle}:${page.flip}:${JSON.stringify(page.crop)}`;
  const keyOf = (page, box) => `${baseOf(page)}:${box.width}`;

  async function draw(thumb, current) {
    if (current !== generation) return;
    try {
      const doc = thumb.file === null ? null : docOf(thumb.file);
      const size = await entrySize(doc, thumb);
      const fit = Math.min(thumb.box.width / size.width, thumb.box.height / size.height);
      for (const element of [thumb.canvas, thumb.canvas.parentElement]) {
        element?.style.setProperty('--fit', String((size.width * fit) / thumb.box.width));
        element?.style.setProperty('--aspect', String(size.height / size.width));
      }
      if (thumb.blank) {
        thumb.canvas.width = Math.ceil(size.width * fit);
        thumb.canvas.height = Math.ceil(size.height * fit);
      } else {
        await renderPage(doc, thumb.source, thumb.rotation, thumb.canvas, fit * THUMB_QUALITY * devicePixelRatio, thumb);
      }
      thumb.state = 'done';
    } catch {
      thumb.state = 'failed';
    }
  }

  const observer = new IntersectionObserver((records) => {
    for (const record of records) {
      if (!record.isIntersecting) continue;
      observer.unobserve(record.target);
      const thumb = thumbs.get(/** @type {HTMLElement} */ (record.target).dataset.key);
      if (thumb && thumb.state === 'idle') {
        thumb.state = 'queued';
        const current = generation;
        renders = renders.then(() => draw(thumb, current));
      }
    }
  });

  return {
    canvasOf(page, box = GRID_BOX) {
      const key = keyOf(page, box);
      let thumb = thumbs.get(key);
      if (!thumb) {
        const canvas = document.createElement('canvas');
        canvas.dataset.key = key;
        thumb = { canvas, box, base: baseOf(page), file: page.file, source: page.source, blank: page.blank, rotation: page.rotation, angle: page.angle, flip: page.flip, crop: page.crop, state: 'idle' };
        thumbs.set(key, thumb);
      }
      observer.observe(thumb.canvas);
      return thumb.canvas;
    },
    canvasDrawn: (page) => thumbs.get(keyOf(page, GRID_BOX))?.canvas,
    // Forgets what none of `pages` can show again.
    keep(pages) {
      const wanted = new Set(pages.map(baseOf));
      for (const [key, thumb] of thumbs) {
        if (wanted.has(thumb.base)) continue;
        observer.unobserve(thumb.canvas);
        thumbs.delete(key);
      }
    },
    reset() {
      generation += 1;
      thumbs.clear();
    },
  };
}
