import { PDFDocument, concatTransformationMatrix, degrees, drawObject, popGraphicsState, pushGraphicsState } from './vendor/pdf-lib.esm.min.js';
import { drawMarks, newCache } from './marks.js';
import { dropUnreachable, isolatePages } from './page-links.js';
import { contentMatrix, isAdjusted, pageBox, uprightMatrix } from './page-adjust.js';
import { multiply } from './find.js';

const parsed = new WeakMap();

// The angle and the mirror of an entry, as a change of coordinates around the content of its copied page.
function adjustContent(output, page, entry) {
  if (!isAdjusted(entry)) return;
  page.node.normalize();
  page.getContentStream();
  const before = page.createContentStream(pushGraphicsState(), concatTransformationMatrix(...contentMatrix(entry, page.getCropBox(), page.getRotation().angle)));
  page.node.wrapContentStreams(output.context.register(before), output.context.register(page.createContentStream(popGraphicsState())));
}

// Copying pages does not change the document they come from, so that the parts of a file can share one parse.
function loadIsolated(bytes) {
  if (!parsed.has(bytes)) {
    parsed.set(
      bytes,
      PDFDocument.load(bytes).then((document) => {
        isolatePages(document);
        return document;
      }),
    );
  }
  return parsed.get(bytes);
}

// Replaces page `index` of `output` by a new page of `size` that draws `box` of the old one (in its coordinates) upright, scaled
// by `scale` from (x, y). What is outside the box stays in the file, clipped; the annotations of the page are left out.
async function redraw(output, index, box, size, { x = 0, y = 0, scale = 1 } = {}) {
  const page = output.getPage(index);
  const rotation = page.getRotation().angle;
  if (!page.node.Contents()) page.pushOperators();
  const embedded = await output.embedPage(page, box);
  output.removePage(index);
  const fresh = output.insertPage(index, size);
  const place = multiply([scale, 0, 0, scale, x, y], uprightMatrix(rotation, box.right - box.left, box.top - box.bottom));
  fresh.pushOperators(pushGraphicsState(), concatTransformationMatrix(...place), drawObject(fresh.node.newXObject('Page', embedded.ref)), popGraphicsState());
}

const shownBox = (page) => pageBox(page.getCropBox(), page.getRotation().angle, { x: 0, y: 0, w: 1, h: 1 });
const shownSize = (page, box) => (page.getRotation().angle % 180 ? [box.top - box.bottom, box.right - box.left] : [box.right - box.left, box.top - box.bottom]);

async function cropLast(output, crop) {
  const index = output.getPageCount() - 1;
  const page = output.getPage(index);
  const box = pageBox(page.getCropBox(), page.getRotation().angle, crop);
  await redraw(output, index, box, shownSize(page, box));
}

// Puts every page on a sheet of `paper` ([width, height] in points, turned to the side of the page), as large as it fits within
// `margin`, centered. The annotations of the pages are left out.
export async function fitPaper(output, paper, margin) {
  for (let index = 0; index < output.getPageCount(); index++) {
    const page = output.getPage(index);
    const box = shownBox(page);
    const [width, height] = shownSize(page, box);
    const sheet = width > height ? [Math.max(...paper), Math.min(...paper)] : [Math.min(...paper), Math.max(...paper)];
    const scale = Math.min((sheet[0] - 2 * margin) / width, (sheet[1] - 2 * margin) / height);
    await redraw(output, index, box, sheet, { x: (sheet[0] - width * scale) / 2, y: (sheet[1] - height * scale) / 2, scale });
  }
}

// `sources` are the bytes of the files the pages come from (an entry names its file by index). A page with redactions, or
// with a crop that removes what is outside, is replaced by the picture burnPage returns, so nothing of its content survives; a
// blank page is an empty page. The output is a new document: the metadata and attachments of the sources are not carried
// over. `finish(output)` runs on the finished document, before it is saved (bookmarks, page numbers, watermarks).
export async function buildPdf(sources, entries, burnPage, finish) {
  const load = (file) => loadIsolated(sources[file]);
  const output = await PDFDocument.create({ updateMetadata: false });
  output.setProducer('Oblitero');
  output.setCreator('Oblitero');
  output.setCreationDate(new Date());
  output.setModificationDate(new Date());

  const burned = (entry) => entry.redactions.length > 0 || !!entry.crop?.remove;
  const copied = (entry) => entry.file !== null && !burned(entry);
  const key = (entry) => `${entry.file}:${entry.source}`;

  // The pages of one file are copied together, so that fonts and images they share are stored once. A page that is used
  // twice (a duplicate) is copied again, because one copy cannot carry two different rotations.
  const firsts = new Map();
  for (const entry of entries) {
    if (!copied(entry) || firsts.has(key(entry))) continue;
    firsts.set(key(entry), entry);
  }
  const copies = new Map();
  for (const file of new Set([...firsts.values()].map((entry) => entry.file))) {
    const wanted = [...firsts.values()].filter((entry) => entry.file === file);
    const pages = await output.copyPages(await load(file), wanted.map((entry) => entry.source));
    wanted.forEach((entry, i) => copies.set(key(entry), pages[i]));
  }

  const marked = newCache();
  for (const entry of entries) {
    if (entry.blank) {
      output.addPage([entry.blank.width, entry.blank.height]).setRotation(degrees(entry.rotation));
    } else if (burned(entry)) {
      const { bytes, width, height } = await burnPage(entry);
      const image = await output.embedJpg(bytes);
      output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    } else {
      let page = copies.get(key(entry));
      if (page) copies.delete(key(entry));
      else [page] = await output.copyPages(await load(entry.file), [entry.source]);
      page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
      output.addPage(page);
      adjustContent(output, page, entry);
    }
    if (entry.crop?.remove) continue;
    await drawMarks(output, output.getPages().at(-1), entry.marks, marked);
    if (entry.crop) await cropLast(output, entry.crop);
  }
  await finish?.(output);
  await dropUnreachable(output);
  return output.save();
}
