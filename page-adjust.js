import { multiply } from './find.js';

// On top of its quarter turns, a page can be turned by any angle (clockwise, in degrees) and mirrored. Both apply to the page
// as displayed: the content turns around the middle of the page, whose size does not change.
export const isAdjusted = (page) => Boolean(page.angle || page.flip);

// The change in the pixels of the displayed page, `width` by `height`: mirrored first, then turned.
export function adjustMatrix(page, width, height) {
  if (!isAdjusted(page)) return null;
  const radians = ((page.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const turn = [cos, sin, -sin, cos, width / 2 - (cos * width) / 2 + (sin * height) / 2, height / 2 - (sin * width) / 2 - (cos * height) / 2];
  return page.flip ? multiply(turn, [-1, 0, 0, 1, width, 0]) : turn;
}

function invert(matrix) {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

// From the coordinates of a page to its pixels as displayed at scale 1, origin at the top left: `box` is its crop box and
// `rotation` its quarter turns.
function viewOf(box, rotation) {
  const flipY = [1, 0, 0, -1, -box.x, box.y + box.height];
  const turns = {
    0: [1, 0, 0, 1, 0, 0],
    90: [0, 1, -1, 0, box.height, 0],
    180: [-1, 0, 0, -1, box.width, box.height],
    270: [0, -1, 1, 0, 0, box.width],
  };
  return multiply(turns[rotation], flipY);
}

const shownSize = (box, rotation) => (rotation % 180 ? [box.height, box.width] : [box.width, box.height]);

// The same change in the coordinates of the page itself, for a `cm` before its content.
export function contentMatrix(page, box, rotation) {
  const view = viewOf(box, rotation);
  return multiply(invert(view), multiply(adjustMatrix(page, ...shownSize(box, rotation)), view));
}

// A rectangle of the displayed page, as fractions from its top left corner, in the coordinates of the page.
export function pageBox(box, rotation, { x, y, w, h }) {
  const [width, height] = shownSize(box, rotation);
  const back = invert(viewOf(box, rotation));
  const corners = [[x, y], [x + w, y + h]].map(([fx, fy]) => [back[0] * fx * width + back[2] * fy * height + back[4], back[1] * fx * width + back[3] * fy * height + back[5]]);
  const xs = corners.map(([cx]) => cx);
  const ys = corners.map(([, cy]) => cy);
  return { left: Math.min(...xs), bottom: Math.min(...ys), right: Math.max(...xs), top: Math.max(...ys) };
}

// Puts content drawn in the coordinates of a page upright on a page of its displayed size: `width` and `height` are the size of
// the content before its quarter turns.
export function uprightMatrix(rotation, width, height) {
  return { 0: [1, 0, 0, 1, 0, 0], 90: [0, -1, 1, 0, 0, width], 180: [-1, 0, 0, -1, width, height], 270: [0, 1, -1, 0, height, 0] }[rotation];
}
