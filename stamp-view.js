import { FORMATS, POSITIONS, checkText } from './stamps.js';
import { byId } from './dom.js';

const DEFAULTS = {
  numbers: { position: 'bottom-center', format: 'of', first: 1, size: 10, skipFirst: false },
  watermark: { text: 'DRAFT', size: 72, opacity: 0.25, angle: 45 },
};

export function initStamps() {
  const dialog = byId('stamp-dialog');
  const field = (id) => byId(id);
  const choices = (select, entries) => select.replaceChildren(...entries.map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));
  choices(field('numbers-position'), POSITIONS);
  choices(field('numbers-format'), FORMATS);

  function show(current) {
    const numbers = current.numbers ?? DEFAULTS.numbers;
    const watermark = current.watermark ?? DEFAULTS.watermark;
    field('numbers-on').checked = !!current.numbers;
    field('numbers-position').value = numbers.position;
    field('numbers-format').value = numbers.format;
    field('numbers-first').value = String(numbers.first);
    field('numbers-size').value = String(numbers.size);
    field('numbers-skip').checked = numbers.skipFirst;
    field('watermark-on').checked = !!current.watermark;
    field('watermark-text').value = watermark.text;
    field('watermark-size').value = String(watermark.size);
    field('watermark-angle').value = String(watermark.angle);
    field('watermark-opacity').value = String(Math.round(watermark.opacity * 100));
    field('stamp-error').textContent = '';
  }

  const number = (id, fallback, min, max) => Math.min(max, Math.max(min, Math.round(Number(field(id).value)) || fallback));

  function read() {
    return {
      numbers: field('numbers-on').checked
        ? {
            position: field('numbers-position').value,
            format: field('numbers-format').value,
            first: number('numbers-first', 1, 0, 99999),
            size: number('numbers-size', 10, 6, 48),
            skipFirst: field('numbers-skip').checked,
          }
        : null,
      watermark: field('watermark-on').checked
        ? {
            text: field('watermark-text').value.trim(),
            size: number('watermark-size', 72, 12, 200),
            angle: number('watermark-angle', 45, -90, 90),
            opacity: number('watermark-opacity', 25, 5, 80) / 100,
          }
        : null,
    };
  }

  // Resolves with the settings the user applied, or null when they cancel.
  function edit(current) {
    show(current);
    return new Promise((resolve) => {
      const session = new AbortController();
      const { signal } = session;
      let result = null;
      byId('stamp-cancel').addEventListener('click', () => dialog.close(), { signal });
      byId('stamp-clear').addEventListener('click', () => ((result = { numbers: null, watermark: null }), dialog.close()), { signal });
      byId('stamp-apply').addEventListener(
        'click',
        async () => {
          const settings = read();
          if (settings.watermark && !settings.watermark.text) {
            field('stamp-error').textContent = 'Type the text of the watermark.';
            return;
          }
          try {
            if (settings.watermark) await checkText(settings.watermark.text);
          } catch (error) {
            field('stamp-error').textContent = error.message;
            return;
          }
          result = settings;
          dialog.close();
        },
        { signal },
      );
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

  return { edit };
}
