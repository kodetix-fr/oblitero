import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { readFields } from './forms.js';

// The page count and the form fields of a PDF; throws when the bytes are not a PDF this reader can open.
export async function openInfo(bytes) {
  const document = await PDFDocument.load(bytes);
  return { count: document.getPageCount(), fields: readFields(document) };
}
