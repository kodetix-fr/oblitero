import { FORMATS, NO_STAMPS, POSITIONS, checkText } from './stamps.js';
import { parseRange } from './pages-model.js';
import { byId, setI18n } from './dom.js';
import { readPhoto } from './photo.js';
import { t } from './i18n.js';

const DEFAULTS = {
  numbers: { position: 'bottom-center', format: 'of', first: 1, size: 10, skipFirst: false },
  watermark: { kind: 'text', text: 'DRAFT', size: 72, opacity: 0.25, angle: 45, scale: 50, tile: false, image: null },
  header: { text: '', align: 'center', size: 10 },
  footer: { text: '', align: 'center', size: 10 },
};

export function initStamps() {
  const dialog = byId('stamp-dialog');
  const field = (id) => byId(id);
  field('numbers-position').replaceChildren(
    ...POSITIONS.map((value) => {
      const option = Object.assign(document.createElement('option'), { value });
      setI18n(option, `position.${value}`);
      return option;
    }),
  );
  field('numbers-format').replaceChildren(...FORMATS.map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));

  let image = null;
  let schedulePreview = () => {};
  const syncKind = () => {
    const picture = field('watermark-kind').value === 'image';
    for (const id of ['watermark-text-field', 'watermark-size-field']) byId(id).hidden = picture;
    for (const id of ['watermark-image-field', 'watermark-scale-field']) byId(id).hidden = !picture;
  };
  const showImageName = () => {
    byId('watermark-image-name').textContent = image ? t('stamp.image-kept', { name: image.name }) : '';
  };
  field('watermark-kind').addEventListener('change', syncKind);
  field('watermark-file').addEventListener('change', async () => {
    const file = field('watermark-file').files[0];
    if (!file) return;
    try {
      image = { ...(await readPhoto(file)), name: file.name };
      field('stamp-error').textContent = '';
    } catch {
      field('stamp-error').textContent = t('sign.error-open');
    }
    field('watermark-file').value = '';
    showImageName();
    schedulePreview();
  });

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
    field('watermark-kind').value = watermark.kind ?? 'text';
    field('watermark-scale').value = String(watermark.scale ?? 50);
    field('watermark-tile').checked = !!watermark.tile;
    image = watermark.image ?? null;
    showImageName();
    syncKind();
    field('watermark-text').value = watermark.text;
    field('watermark-size').value = String(watermark.size);
    field('watermark-angle').value = String(watermark.angle);
    field('watermark-opacity').value = String(Math.round(watermark.opacity * 100));
    for (const band of ['header', 'footer']) {
      const settings = current[band] ?? DEFAULTS[band];
      field(`${band}-on`).checked = !!current[band];
      field(`${band}-text`).value = settings.text;
      field(`${band}-align`).value = settings.align;
      field(`${band}-size`).value = String(settings.size);
    }
    field('stamp-range').value = current.range ?? '';
    field('stamp-error').textContent = '';
  }

  const number = (id, fallback, min, max) => Math.min(max, Math.max(min, Math.round(Number(field(id).value)) || fallback));

  const band = (name) =>
    field(`${name}-on`).checked ? { text: field(`${name}-text`).value.trim(), align: field(`${name}-align`).value, size: number(`${name}-size`, 10, 6, 48) } : null;

  function read() {
    return {
      header: band('header'),
      footer: band('footer'),
      range: field('stamp-range').value.trim(),
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
            kind: field('watermark-kind').value,
            image,
            scale: number('watermark-scale', 50, 10, 100),
            tile: field('watermark-tile').checked,
            text: field('watermark-text').value.trim(),
            size: number('watermark-size', 72, 12, 200),
            angle: number('watermark-angle', 45, -90, 90),
            opacity: number('watermark-opacity', 25, 5, 80) / 100,
          }
        : null,
    };
  }

  // Resolves with the settings the user applied, or null when they cancel.
  function edit(current, preview) {
    show(current);
    return new Promise((resolve) => {
      const session = new AbortController();
      const { signal } = session;
      let timer;
      let latest = 0;
      const drawPreview = async () => {
        const ticket = ++latest;
        // Text the font cannot draw keeps the last preview: Apply is what reports it.
        const drawn = await preview(read()).catch(() => null);
        if (!drawn || ticket !== latest) return;
        byId('stamp-canvas').replaceChildren(drawn.canvas);
        byId('stamp-preview-page').textContent = drawn.caption;
      };
      schedulePreview = () => {
        clearTimeout(timer);
        timer = setTimeout(drawPreview, 250);
      };
      dialog.addEventListener('input', schedulePreview, { signal });
      dialog.addEventListener('change', schedulePreview, { signal });
      signal.addEventListener('abort', () => clearTimeout(timer));
      drawPreview();
      let result = null;
      byId('stamp-cancel').addEventListener('click', () => dialog.close(), { signal });
      byId('stamp-clear').addEventListener('click', () => ((result = { ...NO_STAMPS }), dialog.close()), { signal });
      byId('stamp-apply').addEventListener(
        'click',
        async () => {
          const settings = read();
          const problem =
            (settings.watermark?.kind === 'text' && !settings.watermark.text && 'stamp.error.text') ||
            (settings.watermark?.kind === 'image' && !settings.watermark.image && 'sign.error-image') ||
            (settings.header && !settings.header.text && 'stamp.error-header') ||
            (settings.footer && !settings.footer.text && 'stamp.error-footer') ||
            (settings.range && parseRange(settings.range, 1e6) === null && 'stamp.error-range');
          if (problem) {
            field('stamp-error').textContent = t(problem);
            return;
          }
          try {
            for (const text of [settings.watermark?.kind === 'text' ? settings.watermark.text : '', settings.header?.text, settings.footer?.text]) if (text) await checkText(text);
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
