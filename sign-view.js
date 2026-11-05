import { inkBounds, whiteToTransparent } from './signature.js';
import { askDialog, byId, query } from './dom.js';
import { t } from './i18n.js';

const INK = '#12121c';
const FONTS = '"Segoe Script", "Snell Roundhand", "Brush Script MT", "Lucida Handwriting", cursive';

// The PNG of what is drawn on `canvas`, cropped to its ink; null when nothing is drawn.
async function trimmed(canvas) {
  const bounds = inkBounds(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
  if (!bounds) return null;
  const pad = 6;
  const left = Math.max(0, bounds.left - pad);
  const top = Math.max(0, bounds.top - pad);
  const out = document.createElement('canvas');
  out.width = Math.min(canvas.width, bounds.right + pad) - left;
  out.height = Math.min(canvas.height, bounds.bottom + pad) - top;
  out.getContext('2d').drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  return { png: new Uint8Array(await blob.arrayBuffer()), aspect: out.height / out.width };
}

export function initSign() {
  const dialog = byId('sign-dialog');
  const pad = byId('sign-pad');
  const typed = byId('sign-typed');
  const photo = byId('sign-photo');
  const error = byId('sign-error');
  const modes = ['draw', 'type', 'image'];
  const mode = () => query('input[name="sign-mode"]:checked').value;
  const clear = (canvas) => canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

  function showMode() {
    for (const id of modes) byId(`sign-${id}`).hidden = id !== mode();
    error.textContent = '';
  }

  function renderTyped() {
    clear(typed);
    const text = byId('sign-text').value.trim();
    if (!text) return;
    const context = typed.getContext('2d');
    let size = 130;
    context.font = `italic ${size}px ${FONTS}`;
    while (context.measureText(text).width > typed.width - 40 && size > 20) {
      size -= 4;
      context.font = `italic ${size}px ${FONTS}`;
    }
    context.fillStyle = INK;
    context.textBaseline = 'middle';
    context.fillText(text, 20, typed.height / 2);
  }

  async function renderPhoto(file) {
    clear(photo);
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(photo.width / bitmap.width, photo.height / bitmap.height, 1);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const context = photo.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    if (byId('sign-white').checked) {
      const data = context.getImageData(0, 0, w, h);
      whiteToTransparent(data);
      clear(photo);
      context.putImageData(data, 0, 0);
    }
  }

  // Drawing on the pad with the pointer.
  let last = null;
  const at = (event) => {
    const box = pad.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * pad.width, y: ((event.clientY - box.top) / box.height) * pad.height };
  };
  pad.addEventListener('pointerdown', (event) => {
    pad.setPointerCapture(event.pointerId);
    last = at(event);
    const context = pad.getContext('2d');
    context.fillStyle = INK;
    context.beginPath();
    context.arc(last.x, last.y, 2, 0, Math.PI * 2);
    context.fill();
  });
  pad.addEventListener('pointermove', (event) => {
    if (!last) return;
    const point = at(event);
    const context = pad.getContext('2d');
    context.strokeStyle = INK;
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    last = point;
  });
  const lift = () => {
    last = null;
  };
  pad.addEventListener('pointerup', lift);
  pad.addEventListener('pointercancel', lift);
  byId('sign-reset').addEventListener('click', () => clear(pad));
  for (const input of document.querySelectorAll('input[name="sign-mode"]')) input.addEventListener('change', showMode);
  byId('sign-text').addEventListener('input', renderTyped);
  byId('sign-file').addEventListener('change', () => renderPhoto(byId('sign-file').files[0]).catch(() => (error.textContent = t('sign.error-open'))));
  byId('sign-white').addEventListener('change', () => renderPhoto(byId('sign-file').files[0]).catch(() => {}));

  // Resolves with { png, aspect } (the height over the width), or null when the user cancels.
  function create() {
    clear(pad);
    clear(typed);
    clear(photo);
    byId('sign-text').value = '';
    byId('sign-file').value = '';
    query('input[name="sign-mode"][value="draw"]').checked = true;
    showMode();
    return askDialog(dialog, 'sign-cancel', (finish, signal) => {
      byId('sign-use').addEventListener(
        'click',
        async () => {
          const canvas = { draw: pad, type: typed, image: photo }[mode()];
          const made = await trimmed(canvas);
          if (!made) {
            error.textContent = t(`sign.error-${mode()}`);
            return;
          }
          finish(made);
        },
        { signal },
      );
    });
  }

  return { create };
}
