import { LEVELS, compressPdf, formatSize } from './compress.js';
import { byId } from './dom.js';
import { download } from './download.js';

// Redraws a JPEG at a smaller size and quality; the EXIF orientation is ignored, a PDF ignores it too.
async function encode({ bytes, maxSide, quality }) {
  await new Promise((resolve) => setTimeout(resolve));
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'none' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height } : null;
  } catch {
    return null;
  }
}

export function initCompress() {
  const panel = byId('panel-compress');
  const input = byId('compress-file');
  const levels = byId('compress-levels');
  const downloadButton = byId('compress-download');
  const note = byId('compress-note');
  const status = byId('compress-status');

  let file = null;
  let level = 'balanced';
  let results = new Map();
  let token = 0;

  const setStatus = (text) => {
    status.textContent = text;
    note.textContent = text;
  };

  levels.replaceChildren(
    ...LEVELS.map(([id, text]) => {
      const label = document.createElement('label');
      const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'compress-level', value: id, checked: id === level });
      radio.addEventListener('change', () => {
        level = id;
        show();
      });
      label.append(radio, Object.assign(document.createElement('span'), { textContent: String(text) }));
      return label;
    }),
  );

  function show() {
    const result = results.get(level);
    byId('compress-describe').textContent = String(LEVELS.find(([id]) => id === level)[2]);
    const text = byId('compress-result');
    const bar = byId('compress-bar');
    downloadButton.disabled = true;
    if (!file) return;
    if (!result) {
      text.textContent = 'Working on it...';
      bar.style.width = '100%';
      run(level);
      return;
    }
    const saved = 1 - result.length / file.bytes.length;
    bar.style.width = `${Math.max(2, Math.min(100, (result.length / file.bytes.length) * 100))}%`;
    if (result.length < file.bytes.length) {
      text.replaceChildren(`${formatSize(file.bytes.length)} to `, Object.assign(document.createElement('strong'), { textContent: formatSize(result.length) }), `, ${Math.round(saved * 100)} % smaller.`);
      downloadButton.disabled = false;
    } else {
      text.textContent = 'No saving at this level: the file is already compact. Try a stronger one.';
    }
  }

  async function run(chosen) {
    const mine = token;
    const bytes = file.bytes;
    try {
      const result = await compressPdf(bytes, chosen, encode, (done, total) => {
        if (mine === token && level === chosen && total) byId('compress-result').textContent = `Re-encoding the images: ${done} of ${total}...`;
      });
      if (mine !== token) return;
      results.set(chosen, result);
      if (level === chosen) show();
    } catch (error) {
      if (mine === token) {
        results.set(chosen, bytes);
        setStatus(`Cannot compress this file: ${error.message}`);
        byId('compress-result').textContent = '';
      }
    }
  }

  async function open(chosen) {
    if (!chosen) return;
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    if (new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) {
      setStatus(`Cannot read ${chosen.name}: not a PDF.`);
      return;
    }
    token += 1;
    file = { name: chosen.name, bytes };
    results = new Map();
    setStatus('');
    panel.removeAttribute('data-empty');
    byId('compress-name').textContent = chosen.name;
    byId('compress-name').title = chosen.name;
    byId('compress-size').textContent = formatSize(bytes.length);
    show();
  }

  input.addEventListener('change', async () => {
    await open(input.files[0]);
    input.value = '';
  });
  for (const id of ['open-compress', 'choose-compress']) byId(id).addEventListener('click', () => input.click());
  downloadButton.addEventListener('click', () => {
    const result = results.get(level);
    if (result) download(new Blob([result], { type: 'application/pdf' }), `${file.name.replace(/\.pdf$/i, '')}-compressed.pdf`);
  });

  return { open };
}
