import { PDFDocument } from './vendor/pdf-lib.esm.min.js';

export async function countPages(bytes) {
  const document = await PDFDocument.load(bytes);
  return document.getPageCount();
}
