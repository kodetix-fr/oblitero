import { PDFArray, PDFDict, PDFDocument, PDFName, concatTransformationMatrix, degrees, drawObject, popGraphicsState, pushGraphicsState } from './vendor/pdf-lib.esm.min.js';
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
// by `scale` from (x, y). What is outside the box stays in the file, clipped; the annotations move with the content.
async function redraw(output, index, box, size, { x = 0, y = 0, scale = 1 } = {}) {
  const page = output.getPage(index);
  const rotation = page.getRotation().angle;
  if (!page.node.Contents()) page.pushOperators();
  const embedded = await output.embedPage(page, box);
  const annotations = page.node.Annots();
  output.removePage(index);
  const fresh = output.insertPage(index, size);
  const place = multiply([scale, 0, 0, scale, x, y], uprightMatrix(rotation, box.right - box.left, box.top - box.bottom));
  fresh.pushOperators(pushGraphicsState(), concatTransformationMatrix(...place), drawObject(fresh.node.newXObject('Page', embedded.ref)), popGraphicsState());
  const kept = moveAnnotations(output.context, annotations, multiply(place, [1, 0, 0, 1, -box.left, -box.bottom]), size);
  if (kept.length) fresh.node.set(PDFName.of('Annots'), output.context.obj(kept));
}

const POINT_KEYS = ['QuadPoints', 'L', 'Vertices', 'CL'];

// The annotations of a redrawn page, moved with its content by `matrix`: the links and comments that still touch the new page
// of `size`, with their rectangle and their points in its coordinates.
// shortcut: on a page that had quarter turns, the appearance of a comment is fitted to its new rectangle, not turned with it;
// turn it through its /Matrix if turned comments come up.
function moveAnnotations(context, annotations, matrix, [width, height]) {
  const kept = [];
  const move = (array) => {
    const values = array.asArray().map((value) => value.asNumber());
    const moved = [];
    for (let i = 0; i + 1 < values.length; i += 2) {
      moved.push(matrix[0] * values[i] + matrix[2] * values[i + 1] + matrix[4], matrix[1] * values[i] + matrix[3] * values[i + 1] + matrix[5]);
    }
    return moved;
  };
  for (let i = 0; i < (annotations?.size() ?? 0); i++) {
    const annotation = annotations.lookupMaybe(i, PDFDict);
    const rect = annotation?.lookupMaybe(PDFName.of('Rect'), PDFArray);
    if (!rect || rect.size() !== 4) continue;
    const [x1, y1, x2, y2] = move(rect);
    const box = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    if (box[2] <= 0 || box[3] <= 0 || box[0] >= width || box[1] >= height) continue;
    annotation.set(PDFName.of('Rect'), context.obj(box));
    for (const key of POINT_KEYS) {
      const points = annotation.lookupMaybe(PDFName.of(key), PDFArray);
      if (points) annotation.set(PDFName.of(key), context.obj(move(points)));
    }
    const ink = annotation.lookupMaybe(PDFName.of('InkList'), PDFArray);
    if (ink) annotation.set(PDFName.of('InkList'), context.obj(ink.asArray().map((path) => move(context.lookup(path, PDFArray)))));
    kept.push(annotations.get(i));
  }
  return kept;
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
// `margin`, centered.
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
