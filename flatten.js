import { PDFArray, PDFDict, PDFName, PDFNumber, PDFStream, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, setGraphicsState } from './vendor/pdf-lib.esm.min.js';

const name = (value) => PDFName.of(value);
const HIDDEN = 0b10;
const NO_VIEW = 0b100000;
const numbers = (array) => array?.asArray().map((value) => value.asNumber());

// The appearance an annotation shows now: its normal appearance, or the one of its state (a check box).
function appearanceOf(annotation) {
  const normal = annotation.lookupMaybe(name('AP'), PDFDict)?.get(name('N'));
  const shown = annotation.context.lookup(normal);
  if (shown instanceof PDFStream) return normal;
  if (!(shown instanceof PDFDict)) return null;
  const state = annotation.get(name('AS'));
  return state && annotation.context.lookup(shown.get(state)) instanceof PDFStream ? shown.get(state) : null;
}

// The matrix that puts an appearance on its rectangle: its box, turned by its own matrix, scaled and moved onto the rectangle.
export function placement(rect, bbox, matrix = [1, 0, 0, 1, 0, 0]) {
  const [a, b, c, d, e, f] = matrix;
  const xs = [];
  const ys = [];
  for (const [x, y] of [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]]) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const [left, bottom, right, top] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const sx = right > left ? (Math.max(rect[0], rect[2]) - Math.min(rect[0], rect[2])) / (right - left) : 1;
  const sy = top > bottom ? (Math.max(rect[1], rect[3]) - Math.min(rect[1], rect[3])) / (top - bottom) : 1;
  return [sx, 0, 0, sy, Math.min(rect[0], rect[2]) - sx * left, Math.min(rect[1], rect[3]) - sy * bottom];
}

// Draws the fields and the comments of every page into its content, as they are shown, and removes them, so that nobody can
// change them anymore. A link has nothing to draw and stays; a hidden annotation goes without being drawn.
export function flattenAnnotations(document) {
  for (const page of document.getPages()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    const operators = [];
    for (let i = 0; i < annotations.size(); i++) {
      const annotation = annotations.lookupMaybe(i, PDFDict);
      if (!annotation || annotation.get(name('Subtype')) === name('Link')) continue;
      const flags = annotation.lookupMaybe(name('F'), PDFNumber)?.asNumber() ?? 0;
      const ref = flags & (HIDDEN | NO_VIEW) ? null : appearanceOf(annotation);
      const stream = ref && document.context.lookup(ref, PDFStream);
      const rect = numbers(annotation.lookupMaybe(name('Rect'), PDFArray));
      const bbox = numbers(stream?.dict.lookupMaybe(name('BBox'), PDFArray));
      if (stream && rect?.length === 4 && bbox?.length === 4) {
        operators.push(pushGraphicsState());
        const opacity = annotation.lookupMaybe(name('CA'), PDFNumber)?.asNumber();
        if (opacity !== undefined && opacity < 1) {
          operators.push(setGraphicsState(page.node.newExtGState('Flat', document.context.obj({ ca: opacity, CA: opacity }))));
        }
        const matrix = numbers(stream.dict.lookupMaybe(name('Matrix'), PDFArray));
        operators.push(concatTransformationMatrix(...placement(rect, bbox, matrix?.length === 6 ? matrix : undefined)));
        operators.push(drawObject(page.node.newXObject('Flat', ref)), popGraphicsState());
      }
      annotations.remove(i--);
    }
    if (operators.length) {
      page.node.normalize();
      page.pushOperators(...operators);
    }
    if (annotations.size() === 0) page.node.delete(name('Annots'));
  }
}
