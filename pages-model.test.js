import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPage, createPages, cutBefore, cutEvery, cutToFit, duplicate, insertEntries, parseRange, exportParts, keepCuts, movePages, partsOf, place, rangeIds, removePages, rotateMark, rotatePages, runsOf, rotateRect, showAll, toggleCuts, toggleHidden, visible } from './pages-model.js';

const ids = (pages) => pages.map((page) => page.id);
const close = (actual, expected) => {
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} vs ${expected[key]}`);
};

test('a quarter turn clockwise moves the top left corner to the top right', () => {
  close(rotateRect({ x: 0, y: 0, w: 0.2, h: 0.1 }, 90), { x: 0.9, y: 0, w: 0.1, h: 0.2 });
});

test('a quarter turn counterclockwise moves the top left corner to the bottom left', () => {
  close(rotateRect({ x: 0, y: 0, w: 0.2, h: 0.1 }, -90), { x: 0, y: 0.8, w: 0.1, h: 0.2 });
});

test('four quarter turns, or one turn and its opposite, give the rectangle back', () => {
  const rect = { x: 0.1, y: 0.3, w: 0.25, h: 0.05 };
  let turned = rect;
  for (let i = 0; i < 4; i++) turned = rotateRect(turned, 90);
  close(turned, rect);
  close(rotateRect(rotateRect(rect, 90), -90), rect);
});

test('rotatePages turns the selected pages and their rectangles only', () => {
  const rect = { x: 0, y: 0, w: 0.2, h: 0.1 };
  const pages = createPages(3).map((page) => ({ ...page, redactions: [rect] }));
  const turned = rotatePages(pages, new Set([1]), 90);
  assert.deepEqual(turned.map((page) => page.rotation), [0, 90, 0]);
  assert.equal(turned[0], pages[0]);
  close(turned[1].redactions[0], { x: 0.9, y: 0, w: 0.1, h: 0.2 });
  assert.deepEqual(rotatePages(turned, new Set([1]), -90)[1].rotation, 0);
  assert.deepEqual(rotatePages(pages, new Set([2]), -90)[2].rotation, 270);
});

test('toggleHidden hides the pages, and shows them again only when all of them are hidden', () => {
  const pages = createPages(4);
  const hidden = toggleHidden(pages, new Set([0, 2]));
  assert.deepEqual(hidden.map((page) => page.hidden), [true, false, true, false]);
  assert.equal(hidden[1], pages[1]);
  assert.deepEqual(hidden.map((page) => page.hidden), toggleHidden(pages, new Set([0, 2])).map((page) => page.hidden));
  assert.deepEqual(toggleHidden(hidden, new Set([0, 1])).map((page) => page.hidden), [true, true, true, false]);
  assert.deepEqual(toggleHidden(hidden, new Set([0, 2])).map((page) => page.hidden), [false, false, false, false]);
  assert.equal(toggleHidden(pages, new Set([9])), pages);
});

test('showAll shows every page again, and changes nothing when none is hidden', () => {
  const pages = createPages(3);
  assert.equal(showAll(pages), pages);
  assert.deepEqual(showAll(toggleHidden(pages, new Set([0, 1]))).map((page) => page.hidden), [false, false, false]);
  assert.deepEqual(ids(visible(toggleHidden(pages, new Set([1])))), [0, 2]);
});

test('exportParts leaves the hidden pages out and drops a part that has no page left', () => {
  const pages = toggleHidden(createPages(6), new Set([1, 2, 3]));
  assert.deepEqual(exportParts(pages, new Set()).map((part) => ids(part)), [[0, 4, 5]]);
  assert.deepEqual(exportParts(pages, new Set([2, 3])).map((part) => ids(part)), [[0], [4, 5]]);
  assert.deepEqual(exportParts(pages, new Set([0, 1, 3])).map((part) => ids(part)), [[0], [4, 5]]);
});

test('movePages moves a block as one and stops at the edges', () => {
  const pages = createPages(4);
  assert.deepEqual(ids(movePages(pages, new Set([2]), -1)), [0, 2, 1, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([1, 2]), -1)), [1, 2, 0, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([1, 2]), 1)), [0, 3, 1, 2]);
  assert.deepEqual(ids(movePages(pages, new Set([0, 1]), -1)), [0, 1, 2, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([3]), 1)), [0, 1, 2, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([0, 2]), 1)), [1, 0, 3, 2]);
});

test('rangeIds covers the pages between two ids, in either direction', () => {
  const pages = createPages(5);
  assert.deepEqual(rangeIds(pages, 1, 3), [1, 2, 3]);
  assert.deepEqual(rangeIds(pages, 3, 1), [1, 2, 3]);
  assert.deepEqual(rangeIds(pages, 2, 9), []);
});

test('place moves a page, or a selection, before or after a target', () => {
  const pages = createPages(5);
  assert.deepEqual(ids(place(pages, new Set([0]), 3, true)), [1, 2, 3, 0, 4]);
  assert.deepEqual(ids(place(pages, new Set([0]), 3, false)), [1, 2, 0, 3, 4]);
  assert.deepEqual(ids(place(pages, new Set([4]), 1, false)), [0, 4, 1, 2, 3]);
  assert.deepEqual(ids(place(pages, new Set([1, 3]), 4, true)), [0, 2, 4, 1, 3]);
  assert.deepEqual(ids(place(pages, new Set([3, 1]), 0, false)), [1, 3, 0, 2, 4]);
});

test('place does nothing when the target is moved itself or unknown', () => {
  const pages = createPages(3);
  assert.equal(place(pages, new Set([1, 2]), 2, false), pages);
  assert.equal(place(pages, new Set([1]), 9, true), pages);
});

test('partsOf splits the pages after each cut, and ignores a cut after the last page', () => {
  const pages = createPages(5);
  assert.deepEqual(partsOf(pages, new Set()).map((part) => ids(part)), [[0, 1, 2, 3, 4]]);
  assert.deepEqual(partsOf(pages, new Set([1, 3])).map((part) => ids(part)), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(partsOf(pages, new Set([4])).map((part) => ids(part)), [[0, 1, 2, 3, 4]]);
});

test('cutEvery cuts after every N pages, never after the last one', () => {
  const pages = createPages(6);
  assert.deepEqual([...cutEvery(pages, 2)], [1, 3]);
  assert.deepEqual([...cutEvery(pages, 3)], [2]);
  assert.deepEqual([...cutEvery(pages, 1)], [0, 1, 2, 3, 4]);
  assert.deepEqual([...cutEvery(pages, 6)], []);
});

test('keepCuts drops the cuts of removed pages and the one after the last page', () => {
  const pages = createPages(4).slice(1);
  assert.deepEqual([...keepCuts(pages, new Set([0, 2, 3]))], [2]);
});

test('toggleCuts adds a cut after each page, or removes them when all have one', () => {
  const pages = createPages(4);
  assert.deepEqual([...toggleCuts(pages, new Set(), new Set([0, 2]))], [0, 2]);
  assert.deepEqual([...toggleCuts(pages, new Set([0, 2]), new Set([0, 2]))], []);
  assert.deepEqual([...toggleCuts(pages, new Set([0]), new Set([0, 2]))].sort(), [0, 2]);
  const same = new Set([1]);
  assert.equal(toggleCuts(pages, same, new Set([3])), same);
});

test('createPages numbers the pages of a file, from the id it is given', () => {
  const pages = createPages(2, { file: 3, firstId: 10 });
  assert.deepEqual(pages.map((page) => [page.id, page.file, page.source]), [[10, 3, 0], [11, 3, 1]]);
});

test('insertEntries puts pages before or after a target, or at the end', () => {
  const pages = createPages(3);
  const added = [blankPage(7, 100, 100), blankPage(8, 100, 100)];
  assert.deepEqual(ids(insertEntries(pages, added, 1, false)), [0, 7, 8, 1, 2]);
  assert.deepEqual(ids(insertEntries(pages, added, 1, true)), [0, 1, 7, 8, 2]);
  assert.deepEqual(ids(insertEntries(pages, added, null, true)), [0, 1, 2, 7, 8]);
  assert.equal(added[0].file, null);
  assert.deepEqual(added[0].blank, { width: 100, height: 100 });
});

test('duplicate puts a copy after each selected page, with new ids and its own redactions', () => {
  const pages = createPages(3).map((page) => ({ ...page, redactions: page.id === 1 ? [{ x: 0, y: 0, w: 0.1, h: 0.1 }] : [] }));
  const result = duplicate(pages, new Set([0, 1]), 5);
  assert.deepEqual(ids(result.pages), [0, 5, 1, 6, 2]);
  assert.equal(result.nextId, 7);
  assert.equal(result.pages[3].source, 1);
  assert.notEqual(result.pages[3].redactions[0], pages[1].redactions[0]);
  assert.deepEqual(result.pages[3].redactions, pages[1].redactions);
});

test('parseRange reads numbers, ranges and open ranges, and refuses anything else', () => {
  assert.deepEqual(parseRange('1-3, 7, 10-', 12), [0, 1, 2, 6, 9, 10, 11]);
  assert.deepEqual(parseRange('-4', 10), [0, 1, 2, 3]);
  assert.deepEqual(parseRange('5', 3), []);
  assert.deepEqual(parseRange(' 2 , 2-3 ', 5), [1, 2]);
  assert.deepEqual(parseRange('', 5), []);
  for (const bad of ['a', '3-1', '0', '1--2', '1;2', '-']) assert.equal(parseRange(bad, 5), null, bad);
});

test('removePages drops the pages of the set and keeps the order of the others', () => {
  const pages = createPages(4);
  assert.deepEqual(ids(removePages(pages, new Set([1, 2]))), [0, 3]);
  assert.equal(removePages(pages, new Set()).length, 4);
});

test('runsOf groups consecutive pages of the same file, a blank page apart', () => {
  const first = createPages(2, { file: 0, firstId: 0 });
  const second = createPages(2, { file: 1, firstId: 2 });
  const pages = [first[0], second[0], first[1], blankPage(9, 100, 100), second[1]];
  assert.deepEqual(runsOf(pages).map((run) => [run.file, ids(run.pages)]), [[0, [0]], [1, [2]], [0, [1]], [null, [9]], [1, [3]]]);
  assert.deepEqual(runsOf([...first, ...second]).map((run) => [run.file, ids(run.pages)]), [[0, [0, 1]], [1, [2, 3]]]);
  assert.deepEqual(runsOf([]), []);
});

test('cutBefore starts a part on each page it is given, and never cuts before the first page', () => {
  const pages = createPages(5);
  assert.deepEqual([...cutBefore(pages, new Set([0, 2, 4]))], [1, 3]);
  assert.deepEqual([...cutBefore(pages, new Set([0]))], []);
});

test('cutToFit makes the longest parts under the limit, measured and not added up', async () => {
  const pages = createPages(10);
  let calls = 0;
  // A shared 40 bytes in every file, as fonts are, and 10 bytes per page.
  const sizeOf = async (entries) => {
    calls += 1;
    return 40 + entries.length * 10;
  };
  const { cuts, sizes } = await cutToFit(pages, 75, sizeOf);
  assert.deepEqual([...cuts], [2, 5, 8]);
  assert.deepEqual(sizes, [70, 70, 70, 50]);
  assert.ok(calls < 20, `${calls} measures`);
});

test('cutToFit leaves a document that fits whole, and keeps a page over the limit alone', async () => {
  const pages = createPages(4);
  const whole = await cutToFit(pages, 1000, async (entries) => entries.length);
  assert.deepEqual([...whole.cuts], []);
  assert.deepEqual(whole.sizes, [4]);
  const weight = [1, 50, 1, 1];
  const heavy = await cutToFit(pages, 10, async (entries) => entries.reduce((sum, page) => sum + weight[page.id], 0));
  assert.deepEqual([...heavy.cuts], [0, 1]);
  assert.deepEqual(heavy.sizes, [1, 50, 2]);
});

test('cutToFit does not count the hidden pages, and cuts after a page that stays', async () => {
  const pages = toggleHidden(createPages(5), new Set([1]));
  const { cuts, sizes } = await cutToFit(pages, 2, async (entries) => {
    assert.ok(entries.every((page) => !page.hidden));
    return entries.length;
  });
  assert.deepEqual([...cuts], [2]);
  assert.deepEqual(sizes, [2, 2]);
  assert.deepEqual(exportParts(pages, cuts).map(ids), [[0, 2], [3, 4]]);
});

test('a mark turns with its page, and four quarter turns bring it back', () => {
  const picture = { kind: 'image', png: null, x: 0.1, y: 0.2, w: 0.3, h: 0.05, turn: 0 };
  const text = { kind: 'text', text: 'A', x: 0.1, y: 0.2, size: 0.03, turn: 0 };
  assert.deepEqual(rotateMark(text, 90), { ...text, x: 0.8, y: 0.1, turn: 90 });
  assert.deepEqual(rotateMark(text, -90), { ...text, x: 0.2, y: 0.9, turn: 270 });
  const [page] = rotatePages([{ id: 1, rotation: 0, redactions: [], marks: [picture, text] }], new Set([1]), 90);
  assert.equal(page.rotation, 90);
  assert.deepEqual(page.marks.map((mark) => mark.turn), [90, 90]);
  let turned = [page];
  for (let i = 0; i < 3; i++) turned = rotatePages(turned, new Set([1]), 90);
  assert.equal(turned[0].marks[0].turn, 0);
  close(turned[0].marks[0], picture);
  assert.ok(Math.abs(turned[0].marks[1].y - 0.2) < 1e-9);
});
