import { PDFDocument, degrees } from './vendor/pdf-lib.esm.min.js';

// A page with redactions is replaced by the picture burnPage returns, so nothing of its content survives. The output is
// a new document: the metadata, outline and attachments of the source are not carried over.
export async function buildPdf(sourceBytes, entries, burnPage) {
  const source = await PDFDocument.load(sourceBytes);
  const output = await PDFDocument.create();
  output.setProducer('Oblitero');
  output.setCreator('Oblitero');

  const kept = entries.filter((entry) => entry.redactions.length === 0).map((entry) => entry.source);
  const copies = new Map();
  if (kept.length > 0) {
    const copied = await output.copyPages(source, kept);
    kept.forEach((index, i) => copies.set(index, copied[i]));
  }

  for (const entry of entries) {
    if (entry.redactions.length > 0) {
      const { bytes, width, height } = await burnPage(entry);
      const image = await output.embedJpg(bytes);
      output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    } else {
      const page = copies.get(entry.source);
      page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
      output.addPage(page);
    }
  }
  return output.save();
}
