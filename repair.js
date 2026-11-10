import { PDFDict, PDFDocument, PDFName, PDFNumber } from './vendor/pdf-lib.esm.min.js';

const latin1 = new TextDecoder('latin1');
const quiet = { throwOnInvalidObject: false, updateMetadata: false };

// A damaged PDF (cut short, or with its cross-reference table or its page tree lost) rewritten from the objects that can still
// be read: every whole page, in the order of the file, under a new page tree. Resolves with the bytes, the pages kept, and the
// pages the file said it had (null when that is lost too). Throws when no page can be read.
export async function rebuildPdf(bytes) {
  const end = latin1.decode(bytes).lastIndexOf('endobj');
  if (end < 0) throw new Error('No PDF object');
  const whole = bytes.slice(0, end + 'endobj'.length);
  const source = await PDFDocument.load(whole, quiet);
  const pages = [];
  /** @type {number | null} */
  let declared = null;
  let top = 0;
  for (const [ref, object] of source.context.enumerateIndirectObjects()) {
    top = Math.max(top, ref.objectNumber);
    if (!(object instanceof PDFDict)) continue;
    const type = object.get(PDFName.of('Type'));
    if (type === PDFName.of('Page')) pages.push(ref);
    if (type === PDFName.of('Pages')) declared = Math.max(declared ?? 0, object.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber() ?? 0);
  }
  if (pages.length === 0) throw new Error('No page can be read');
  pages.sort((a, b) => a.objectNumber - b.objectNumber);
  // pdf-lib makes its page tree and catalog when it reads them, so the new ones are written after the objects and read again.
  const kids = pages.map((ref) => `${ref.objectNumber} ${ref.generationNumber} R`).join(' ');
  const tail = [
    `\n${top + 1} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} /MediaBox [0 0 612 792] >>\nendobj`,
    `\n${top + 2} 0 obj\n<< /Type /Catalog /Pages ${top + 1} 0 R >>\nendobj`,
    `\ntrailer\n<< /Root ${top + 2} 0 R /Size ${top + 3} >>\nstartxref\n0\n%%EOF\n`,
  ].join('');
  const fixed = new Uint8Array(whole.length + tail.length);
  fixed.set(whole);
  fixed.set(Uint8Array.from(tail, (char) => char.charCodeAt(0)), whole.length);
  const rebuilt = await PDFDocument.load(fixed, quiet);
  const tree = rebuilt.catalog.get(PDFName.of('Pages'));
  for (const page of rebuilt.getPages()) page.node.set(PDFName.of('Parent'), tree);
  return { bytes: await rebuilt.save(), pages: pages.length, declared: declared && declared >= pages.length ? declared : null };
}
