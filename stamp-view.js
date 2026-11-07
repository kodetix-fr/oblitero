import { FORMATS, NO_STAMPS, POSITIONS, checkText } from './stamps.js';
import { parseRange } from './pages-model.js';
import { askDialog, byId, setI18n } from './dom.js';
import { clamp } from './math.js';
import { readPhoto } from './photo.js';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { t } from './i18n.js';

const DEFAULTS = {
  numbers: { position: 'bottom-center', format: 'of', first: 1, size: 10, skipFirst: false },
  watermark: { kind: 'text', text: 'DRAFT', size: 72, opacity: 0.25, angle: 45, scale: 50, tile: false, image: null },
  bates: { prefix: 'DOC-', suffix: '', first: 1, digits: 6, position: 'bottom-right', size: 10 },
  stamp: { kind: 'text', text: 'CONFIDENTIAL', size: 18, scale: 20, position: 'top-right', image: null },
  header: { text: '', align: 'center', size: 10 },
  footer: { text: '', align: 'center', size: 10 },
};

export function initStamps() {
  const dialog = byId('stamp-dialog');
  const field = (id) => byId(id);
  for (const id of ['numbers-position', 'bates-position', 'mark-position']) {
    field(id).replaceChildren(
      ...POSITIONS.map((value) => {
        const option = Object.assign(document.createElement('option'), { value });
        setI18n(option, `position.${value}`);
        return option;
      }),
    );
  }
  field('numbers-format').replaceChildren(...FORMATS.map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));

  let image = null;
  let markImage = null;
  let sheet = null;
  let schedulePreview = () => {};
  const syncKind = () => {
    const picture = field('watermark-kind').value === 'image';
    for (const id of ['watermark-text-field', 'watermark-size-field']) byId(id).hidden = picture;
    for (const id of ['watermark-image-field', 'watermark-scale-field']) byId(id).hidden = !picture;
  };
  const showImageName = () => {
    byId('watermark-image-name').textContent = image ? t('stamp.image-kept', { name: image.name }) : '';
  };
  const showSheetName = () => {
    byId('letterhead-name').textContent = sheet ? t('stamp.letterhead-kept', { name: sheet.name }) : '';
  };
  field('letterhead-file').addEventListener('change', async () => {
    const file = field('letterhead-file').files[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if ((await PDFDocument.load(bytes)).getPageCount() === 0) throw new Error();
      sheet = { bytes, name: file.name };
      field('letterhead-on').checked = true;
      field('stamp-error').textContent = '';
    } catch {
      field('stamp-error').textContent = t('stamp.letterhead-unreadable');
    }
    field('letterhead-file').value = '';
    showSheetName();
    schedulePreview();
  });
  const syncMarkKind = () => {
    const picture = field('mark-kind').value === 'image';
    for (const id of ['mark-text-field', 'mark-size-field']) byId(id).hidden = picture;
    for (const id of ['mark-image-field', 'mark-scale-field']) byId(id).hidden = !picture;
  };
  const showMarkImageName = () => {
    byId('mark-image-name').textContent = markImage ? t('stamp.image-kept', { name: markImage.name }) : '';
  };
  field('mark-kind').addEventListener('change', syncMarkKind);
  field('mark-file').addEventListener('change', async () => {
    const file = field('mark-file').files[0];
    if (!file) return;
    try {
      markImage = { ...(await readPhoto(file)), name: file.name };
      field('stamp-error').textContent = '';
    } catch {
      field('stamp-error').textContent = t('sign.error-open');
    }
    field('mark-file').value = '';
    showMarkImageName();
    schedulePreview();
  });
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
    const bates = current.bates ?? DEFAULTS.bates;
    field('bates-on').checked = !!current.bates;
    for (const key of ['prefix', 'suffix', 'first', 'digits', 'position', 'size']) field(`bates-${key}`).value = String(bates[key]);
    const mark = current.stamp ?? DEFAULTS.stamp;
    field('mark-on').checked = !!current.stamp;
    for (const key of ['kind', 'text', 'size', 'scale', 'position']) field(`mark-${key}`).value = String(mark[key]);
    markImage = mark.image ?? null;
    showMarkImageName();
    syncMarkKind();
    field('letterhead-on').checked = !!current.letterhead;
    sheet = current.letterhead ? { bytes: current.letterhead.bytes, name: current.letterhead.name } : null;
    field('letterhead-place').value = current.letterhead?.under === false ? 'over' : 'under';
    field('letterhead-opacity').value = String(Math.round((current.letterhead?.opacity ?? 1) * 100));
    showSheetName();
    field('stamp-range').value = current.range ?? '';
    field('stamp-error').textContent = '';
  }

  const number = (id, fallback, min, max) => clamp(Math.round(Number(field(id).value)) || fallback, min, max);

  const band = (name) =>
    field(`${name}-on`).checked ? { text: field(`${name}-text`).value.trim(), align: field(`${name}-align`).value, size: number(`${name}-size`, 10, 6, 48) } : null;

  function read() {
    return {
      header: band('header'),
      footer: band('footer'),
      range: field('stamp-range').value.trim(),
      bates: field('bates-on').checked
        ? {
            prefix: field('bates-prefix').value.trim(),
            suffix: field('bates-suffix').value.trim(),
            first: number('bates-first', 1, 0, 999999999),
            digits: number('bates-digits', 6, 1, 12),
            position: field('bates-position').value,
            size: number('bates-size', 10, 6, 48),
          }
        : null,
      stamp: field('mark-on').checked
        ? {
            kind: field('mark-kind').value,
            text: field('mark-text').value.trim(),
            image: markImage,
            size: number('mark-size', 18, 8, 72),
            scale: number('mark-scale', 20, 5, 60),
            position: field('mark-position').value,
          }
        : null,
      letterhead:
        field('letterhead-on').checked && sheet
          ? { ...sheet, under: field('letterhead-place').value === 'under', opacity: number('letterhead-opacity', 100, 10, 100) / 100 }
          : null,
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
    return askDialog(dialog, 'stamp-cancel', (finish, signal) => {
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
      byId('stamp-clear').addEventListener('click', () => finish({ ...NO_STAMPS }), { signal });
      byId('stamp-apply').addEventListener(
        'click',
        async () => {
          const settings = read();
          const problem =
            (settings.watermark?.kind === 'text' && !settings.watermark.text && 'stamp.error.text') ||
            (settings.watermark?.kind === 'image' && !settings.watermark.image && 'sign.error-image') ||
            (settings.header && !settings.header.text && 'stamp.error-header') ||
            (settings.footer && !settings.footer.text && 'stamp.error-footer') ||
            (field('letterhead-on').checked && !sheet && 'stamp.error-letterhead') ||
            (settings.stamp?.kind === 'text' && !settings.stamp.text && 'stamp.error-mark') ||
            (settings.stamp?.kind === 'image' && !settings.stamp.image && 'sign.error-image') ||
            (settings.range && parseRange(settings.range, 1e6) === null && 'stamp.error-range');
          if (problem) {
            field('stamp-error').textContent = t(problem);
            return;
          }
          try {
            const texts = [settings.watermark?.kind === 'text' ? settings.watermark.text : '', settings.header?.text, settings.footer?.text];
            texts.push(settings.bates?.prefix, settings.bates?.suffix, settings.stamp?.kind === 'text' ? settings.stamp.text : '');
            for (const text of texts) if (text) await checkText(text);
          } catch (error) {
            field('stamp-error').textContent = error.message;
            return;
          }
          finish(settings);
        },
        { signal },
      );
    });
  }

  return { edit };
}
