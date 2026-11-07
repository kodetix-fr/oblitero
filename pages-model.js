// A page of the document: where it comes from (`file`, and `source`, its index in that file) and what was done to it.
export function createPages(count, { file = 0, firstId = 0 } = {}) {
  return Array.from({ length: count }, (_, source) => ({ id: firstId + source, file, source, rotation: 0, angle: 0, flip: false, crop: null, redactions: [], marks: [], hidden: false }));
}

export function blankPage(id, width, height) {
  return { id, file: null, source: null, blank: { width, height }, rotation: 0, angle: 0, flip: false, crop: null, redactions: [], marks: [], hidden: false };
}

// Puts new entries right before or after the entry `targetId`, or at the end when there is no such entry.
export function insertEntries(list, entries, targetId, after) {
  const index = list.findIndex((entry) => entry.id === targetId);
  const at = index < 0 ? list.length : index + (after ? 1 : 0);
  return [...list.slice(0, at), ...entries, ...list.slice(at)];
}

// A copy of each page of `ids`, right after it, with the ids that start at `firstId`.
export function duplicate(pages, ids, firstId) {
  let next = firstId;
  const result = [];
  for (const page of pages) {
    result.push(page);
    if (ids.has(page.id)) result.push({ ...page, id: next++, redactions: page.redactions.map((rectangle) => ({ ...rectangle })) });
  }
  return { pages: result, nextId: next };
}

// "1-3, 7, 10-" -> the positions (0-based) of those pages. `-4` is pages 1 to 4, `10-` is page 10 to the last.
// Returns null when the text is not a list of numbers and ranges.
export function parseRange(text, count) {
  const positions = new Set();
  for (const part of text.split(',').map((item) => item.trim()).filter(Boolean)) {
    const match = /^(\d*)\s*(-?)\s*(\d*)$/.exec(part);
    if (!match || (!match[1] && !match[3])) return null;
    const dash = match[2] === '-';
    const first = match[1] ? Number(match[1]) : 1;
    const last = dash ? (match[3] ? Number(match[3]) : count) : first;
    if (first < 1 || last < first) return null;
    for (let page = first; page <= Math.min(last, count); page++) positions.add(page - 1);
  }
  return [...positions].sort((a, b) => a - b);
}

// Rectangles are fractions of the page as displayed, so a quarter turn of the page turns them too.
export function rotateRect({ x, y, w, h }, delta) {
  return delta > 0 ? { x: 1 - y - h, y: x, w: h, h: w } : { x: y, y: 1 - x - w, w: h, h: w };
}

// A mark stays on what it was put on, so a quarter turn of the page moves it and turns it with the page. A text is placed by the
// top left corner of its line.
export function rotateMark(mark, delta) {
  const turn = (mark.turn + delta + 360) % 360;
  if (mark.kind === 'image') return { ...mark, ...rotateRect(mark, delta), turn };
  return { ...mark, x: delta > 0 ? 1 - mark.y : mark.y, y: delta > 0 ? mark.x : 1 - mark.x, turn };
}

// The size of a text in points: a fraction of the side of the page that was its width when the text was placed.
export const textSizeOn = (mark, width, height) => mark.size * (mark.turn % 180 ? height : width);

export function rotatePages(pages, ids, delta) {
  return pages.map((page) =>
    ids.has(page.id)
      ? {
          ...page,
          rotation: (page.rotation + delta + 360) % 360,
          redactions: page.redactions.map((rect) => rotateRect(rect, delta)),
          crop: page.crop && { ...page.crop, ...rotateRect(page.crop, delta) },
          marks: page.marks.map((mark) => rotateMark(mark, delta)),
        }
      : page,
  );
}

// Puts `order` (the pages of `ids`, rearranged) back into the places those pages held.
function refill(pages, ids, order) {
  let next = 0;
  return pages.map((page) => (ids.has(page.id) ? order[next++] : page));
}

export const reversePages = (pages, ids) => refill(pages, ids, pages.filter((page) => ids.has(page.id)).reverse());

// One page of each file in turn, in the order the files first appear: the fronts and the backs of a duplex scan. A file with
// more pages ends the sequence with the rest.
export function interleavePages(pages, ids) {
  const groups = new Map();
  for (const page of pages) if (ids.has(page.id)) groups.set(page.file, [...(groups.get(page.file) ?? []), page]);
  const longest = Math.max(0, ...[...groups.values()].map((group) => group.length));
  const order = [];
  for (let index = 0; index < longest; index++) {
    for (const group of groups.values()) if (index < group.length) order.push(group[index]);
  }
  return refill(pages, ids, order);
}

// The angle and the mirror move the content under the rectangles, so they leave alone a page that has some, and a blank page.
export const canAdjust = (page) => !page.blank && page.redactions.length === 0;

export const setAngle = (pages, ids, angle) => pages.map((page) => (ids.has(page.id) && canAdjust(page) ? { ...page, angle } : page));

export const toggleFlip = (pages, ids) => pages.map((page) => (ids.has(page.id) && canAdjust(page) ? { ...page, flip: !page.flip } : page));

// A crop is a rectangle of the displayed page ({ x, y, w, h } as fractions) and whether what is outside is destroyed (`remove`):
// then the page becomes a picture of what is inside. null takes the crop away.
export const setCrop = (pages, ids, crop) => pages.map((page) => (ids.has(page.id) && !page.blank ? { ...page, crop } : page));

export const removePages = (pages, ids) => pages.filter((page) => !ids.has(page.id));

// Consecutive pages that come from the same file make one run (a blank page is a run of its own file, null).
export function runsOf(pages) {
  const runs = [];
  for (const page of pages) {
    const last = runs.at(-1);
    if (last && last.file === page.file) last.pages.push(page);
    else runs.push({ file: page.file, pages: [page] });
  }
  return runs;
}

// Hiding keeps a page in the document view but out of every result. Hides the pages of `ids`, or shows them again when
// all of them are already hidden.
export function toggleHidden(pages, ids) {
  const targets = pages.filter((page) => ids.has(page.id));
  if (targets.length === 0) return pages;
  const hidden = !targets.every((page) => page.hidden);
  return pages.map((page) => (ids.has(page.id) ? { ...page, hidden } : page));
}

export function showAll(pages) {
  return pages.some((page) => page.hidden) ? pages.map((page) => (page.hidden ? { ...page, hidden: false } : page)) : pages;
}

export const visible = (pages) => pages.filter((page) => !page.hidden);
export function movePages(pages, ids, step) {
  const next = pages.slice();
  if (step < 0) {
    for (let i = 1; i < next.length; i++) {
      if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i - 1], next[i]] = [next[i], next[i - 1]];
    }
  } else {
    for (let i = next.length - 2; i >= 0; i--) {
      if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    }
  }
  return next;
}

export function rangeIds(pages, fromId, toId) {
  const from = pages.findIndex((page) => page.id === fromId);
  const to = pages.findIndex((page) => page.id === toId);
  if (from < 0 || to < 0) return [];
  return pages.slice(Math.min(from, to), Math.max(from, to) + 1).map((page) => page.id);
}

// Moves the entries of `ids` (kept in their order) right before or right after the entry `targetId`.
export function place(list, ids, targetId, after) {
  if (ids.has(targetId)) return list;
  const rest = list.filter((entry) => !ids.has(entry.id));
  const index = rest.findIndex((entry) => entry.id === targetId);
  if (index < 0) return list;
  const at = index + (after ? 1 : 0);
  return [...rest.slice(0, at), ...list.filter((entry) => ids.has(entry.id)), ...rest.slice(at)];
}

// A cut sits after the page whose id is in `cuts`: the pages between two cuts make one part.
export function partsOf(pages, cuts) {
  const parts = [[]];
  pages.forEach((page, index) => {
    parts[parts.length - 1].push(page);
    if (cuts.has(page.id) && index < pages.length - 1) parts.push([]);
  });
  return parts;
}

export function cutEvery(pages, size) {
  const cuts = new Set();
  for (let i = size - 1; i < pages.length - 1; i += size) cuts.add(pages[i].id);
  return cuts;
}

// A cut right before each of the pages `starts`, so that a part begins on each of them.
export function cutBefore(pages, starts) {
  const cuts = new Set();
  pages.forEach((page, index) => {
    if (index > 0 && starts.has(page.id)) cuts.add(pages[index - 1].id);
  });
  return cuts;
}

// The longest parts that hold within `limit` bytes, and their sizes. `sizeOf` builds consecutive pages and gives their real
// size, which is not the sum of the pages (they share fonts and pictures). A page over the limit alone is a part of its own.
export async function cutToFit(pages, limit, sizeOf) {
  const shown = visible(pages);
  const cuts = new Set();
  const sizes = [];
  let start = 0;
  while (start < shown.length) {
    const from = start;
    const room = shown.length - from;
    let size = await sizeOf(shown.slice(from, from + 1));
    let good = 1;
    let bad = size > limit ? 2 : room + 1;
    while (bad - good > 1) {
      const count = bad > room ? Math.min(good * 2, room) : (good + bad) >> 1;
      const measured = await sizeOf(shown.slice(from, from + count));
      if (measured <= limit) {
        good = count;
        size = measured;
      } else {
        bad = count;
      }
    }
    sizes.push(size);
    start += good;
    if (start < shown.length) cuts.add(shown[start - 1].id);
  }
  return { cuts, sizes };
}

export function keepCuts(pages, cuts) {
  const cuttable = new Set(pages.slice(0, -1).map((page) => page.id));
  return new Set([...cuts].filter((id) => cuttable.has(id)));
}

// Adds a cut after each of the pages `ids`, or removes them all when every one of them already has one.
export function toggleCuts(pages, cuts, ids) {
  const targets = pages.slice(0, -1).filter((page) => ids.has(page.id)).map((page) => page.id);
  if (targets.length === 0) return cuts;
  const remove = targets.every((id) => cuts.has(id));
  const next = new Set(cuts);
  for (const id of targets) {
    if (remove) next.delete(id);
    else next.add(id);
  }
  return next;
}

// The parts that go into the result: the pages between two cuts, without the hidden ones, and no empty part.
export function exportParts(pages, cuts) {
  return partsOf(pages, cuts).map(visible).filter((part) => part.length > 0);
}
