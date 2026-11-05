const THRESHOLD = 4;

// A drag that starts on the background of the stage draws a rectangle; the pages it touches are selected (Shift or Ctrl/Cmd
// keeps the current selection). A plain click on the background clears the selection. `cards` maps the page ids to their buttons.
export function initMarquee(stage, { enabled, selection, select, cards }) {
  stage.addEventListener('pointerdown', (/** @type {PointerEvent} */ event) => {
    if (event.button !== 0 || !enabled()) return;
    if (/** @type {Element} */ (event.target).closest('.card, .cut, button, input')) return;
    event.preventDefault();
    const keep = event.shiftKey || event.metaKey || event.ctrlKey ? new Set(selection()) : new Set();
    const start = { x: event.clientX, y: event.clientY };
    const band = document.createElement('div');
    band.className = 'marquee';
    document.body.append(band);
    stage.setPointerCapture(event.pointerId);
    const gesture = new AbortController();
    const options = { signal: gesture.signal };
    let moved = false;
    const finish = () => {
      gesture.abort();
      band.remove();
    };
    stage.addEventListener(
      'pointermove',
      (e) => {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
        moved = true;
        const left = Math.min(start.x, e.clientX);
        const top = Math.min(start.y, e.clientY);
        const right = Math.max(start.x, e.clientX);
        const bottom = Math.max(start.y, e.clientY);
        Object.assign(band.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
        const next = new Set(keep);
        for (const [id, element] of cards) {
          const box = element.getBoundingClientRect();
          if (box.left < right && box.right > left && box.top < bottom && box.bottom > top) next.add(id);
        }
        select(next);
      },
      options,
    );
    stage.addEventListener(
      'pointerup',
      () => {
        finish();
        if (!moved && keep.size === 0) select(new Set());
      },
      options,
    );
    stage.addEventListener('pointercancel', finish, options);
  });
}
