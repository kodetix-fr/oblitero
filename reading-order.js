// The text of a page in reading order, from the position of each text run. A PDF stores its text in the order it was drawn,
// which is not the order a person reads when the page has columns. The page is cut into blocks with a recursive XY cut:
// a gutter between two blocks of text (columns), or a band of white across the page (a header, a paragraph, a table row).
//
// `runs`: [{ text, x, y, width, height }] in the space of the displayed page, y growing downward, y the baseline.
// shortcut: runs are taken as horizontal; vertical text and text that follows a curve are read in the order of their position, and a table whose columns hold long text is read column by column.

const GUTTER = 1;
const BAND = 0.9;
const WIDE_BAND = 2.5;
const SAME_LINE = 0.5;
const SPACE = 0.2;
const PARAGRAPH = 1.7;
const COLUMN_LINES = 3;
const COLUMN_WIDTH = 0.2;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const left = (run) => run.x;
const right = (run) => run.x + run.width;
const top = (run) => run.y - run.height;
const bottom = (run) => run.y;

// The places where the runs, projected on an axis, leave a gap of at least `minGap`: [{ before, after }].
function gaps(runs, start, end, minGap) {
  const sorted = [...runs].sort((a, b) => start(a) - start(b));
  const found = [];
  let reach = end(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (start(sorted[i]) - reach >= minGap) found.push({ before: sorted.slice(0, i), after: sorted.slice(i) });
    reach = Math.max(reach, end(sorted[i]));
  }
  return found;
}

// The runs that sit on the same baseline, top to bottom.
function rowsOf(runs, unit) {
  const rows = [];
  for (const run of [...runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && run.y - row.y <= SAME_LINE * unit) row.runs.push(run);
    else rows.push({ y: run.y, runs: [run] });
  }
  return rows;
}

// A side of a column cut is a column of text when it has a few lines and is not a sliver.
function isColumn(side, width, unit) {
  return rowsOf(side, unit).length >= COLUMN_LINES && Math.max(...side.map(right)) - Math.min(...side.map(left)) >= COLUMN_WIDTH * width;
}

// The best band of rows, between a header or a table and the rest, where the text falls in two columns on either side of a
// gutter that no run crosses: { above, left, right, below }, or null.
function columnZone(runs, unit, width) {
  const rows = rowsOf(runs, unit);
  const candidates = [];
  for (const row of rows) {
    const sorted = [...row.runs].sort((a, b) => a.x - b.x);
    let reach = right(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      if (left(sorted[i]) - reach >= GUTTER * unit) candidates.push((reach + left(sorted[i])) / 2);
      reach = Math.max(reach, right(sorted[i]));
    }
  }
  for (const cut of gaps(runs, left, right, GUTTER * unit)) candidates.push((Math.max(...cut.before.map(right)) + Math.min(...cut.after.map(left))) / 2);
  const half = (GUTTER * unit) / 2;
  const rowTop = (row) => Math.min(...row.runs.map(top));
  const rowBottom = (row) => Math.max(...row.runs.map(bottom));
  const wideAfter = (i) => rowTop(rows[i + 1]) - rowBottom(rows[i]) >= WIDE_BAND * unit;
  /** @type {{ score: number, above: any[], left: any[], right: any[], below: any[] } | null} */
  let best = null;
  for (const x of new Set(candidates.map((value) => Math.round(value / unit) * unit))) {
    const free = rows.map((row) => row.runs.every((run) => right(run) <= x - half || left(run) >= x + half));
    for (let start = 0; start < rows.length; start++) {
      if (!free[start]) continue;
      let end = start;
      while (end + 1 < rows.length && free[end + 1]) end++;
      const stretch = [start, end];
      // A few lines cut off from the columns by a wide band, at either end, are a title or a footnote, not a column.
      let first = start;
      let last = end;
      for (let stop = first; first < last; ) {
        while (stop < last && !wideAfter(stop)) stop++;
        if (stop === last || stop - first + 1 >= COLUMN_LINES) break;
        first = ++stop;
      }
      for (let stop = last; last > first; ) {
        while (stop > first && !wideAfter(stop - 1)) stop--;
        if (stop === first || last - stop + 1 >= COLUMN_LINES) break;
        last = --stop;
      }
      const zone = rows.slice(first, last + 1).flatMap((row) => row.runs);
      const sides = [zone.filter((run) => right(run) <= x), zone.filter((run) => left(run) >= x)];
      const score = last - first + 1;
      if (score >= COLUMN_LINES && (!best || score > best.score) && sides.every((side) => side.length && isColumn(side, width, unit))) {
        best = { score, above: rows.slice(0, first).flatMap((row) => row.runs), left: sides[0], right: sides[1], below: rows.slice(last + 1).flatMap((row) => row.runs) };
      }
      start = stretch[1];
    }
  }
  return best;
}

function blocks(runs, unit, width) {
  if (runs.length < 2) return [runs];
  const zone = columnZone(runs, unit, width);
  if (zone) return [zone.above, zone.left, zone.right, zone.below].filter((part) => part.length).flatMap((part) => blocks(part, unit, width));
  // A wide band of white across the page (under a header, above a footer, between two parts) is a cut of its own.
  const [wide] = gaps(runs, top, bottom, WIDE_BAND * unit);
  if (wide) return [...blocks(wide.before, unit, width), ...blocks(wide.after, unit, width)];
  const [band] = gaps(runs, top, bottom, BAND * unit);
  if (band) return [...blocks(band.before, unit, width), ...blocks(band.after, unit, width)];
  return [runs];
}

// The lines of a block of runs, top to bottom, each as { y, text }.
function lines(runs, unit) {
  const rows = [];
  for (const run of [...runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && run.y - row.y <= SAME_LINE * unit) row.runs.push(run);
    else rows.push({ y: run.y, runs: [run] });
  }
  return rows.map((row) => {
    let text = '';
    let end = -Infinity;
    for (const run of row.runs.sort((a, b) => a.x - b.x)) {
      const spaced = text && !/\s$/.test(text) && !/^\s/.test(run.text) && run.x - end > SPACE * unit;
      text += (spaced ? ' ' : '') + run.text;
      end = Math.max(end, right(run));
    }
    return { y: row.y, text: text.replace(/[ \t]+$/, '') };
  });
}

/** @param {Array<{ text: string, x: number, y: number, width: number, height: number }>} runs */
export function readingText(runs) {
  const drawn = runs.filter((run) => run.text.trim());
  if (drawn.length === 0) return '';
  const unit = median(drawn.map((run) => run.height)) || 10;
  const width = Math.max(...drawn.map(right)) - Math.min(...drawn.map(left));
  let text = '';
  /** @type {number | null} */
  let last = null;
  for (const block of blocks(drawn, unit, width)) {
    for (const [index, line] of lines(block, unit).entries()) {
      // A blank line where the next line is a paragraph away, or where the reading goes back up to the next column.
      const drop = last === null ? 0 : line.y - last;
      const separator = last === null ? '' : drop > PARAGRAPH * unit || (index === 0 && drop <= 0) ? '\n\n' : '\n';
      text += separator + line.text;
      last = line.y;
    }
  }
  return text.trim();
}
