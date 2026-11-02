import { jpegOrientation, kindOf } from './images.js';

// Draws a decoded image on a white canvas (the browser applies the EXIF orientation while decoding).
async function redraw(bitmap, type, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('The image is too large to convert.');
  return new Uint8Array(await blob.arrayBuffer());
}

// A picture as a JPEG or a PNG that a PDF can hold. A JPEG or PNG goes in as it is; the other formats, and a JPEG that is
// stored sideways, are redrawn first. Throws when the browser cannot decode the file.
export async function readPhoto(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    const kind = kindOf(bytes);
    if (kind === 'png' || (kind === 'jpg' && jpegOrientation(bytes) === 1)) return { bytes, kind };
    const photo = kind === 'jpg' || /\.(webp|avif|heic)$/i.test(file.name);
    return { bytes: await redraw(bitmap, photo ? 'image/jpeg' : 'image/png', 0.92), kind: photo ? 'jpg' : 'png' };
  } finally {
    bitmap.close();
  }
}

// Redraws a JPEG of a PDF at a smaller size and quality; the EXIF orientation is ignored, a PDF ignores it too.
export async function recode({ bytes, maxSide, quality }) {
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
