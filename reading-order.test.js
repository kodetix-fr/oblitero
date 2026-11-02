import test from 'node:test';
import assert from 'node:assert/strict';
import { readingText } from './reading-order.js';

// One run of text of `size` points, as the reader reports it: the width is about half the size for each character.
const run = (text, x, y, size = 11) => ({ text, x, y, width: text.length * size * 0.5, height: size });

// `count` lines of a column at `x`, from the baseline `first`, 15 points apart.
const column = (label, x, first, count) => Array.from({ length: count }, (_, i) => run(`${label}-${i + 1} lorem ipsum dolor sit amet consectetur`, x, first + i * 15));

test('a single column is read from top to bottom, whatever the order the runs were drawn in', () => {
  const runs = [run('third line', 56, 130), run('first line', 56, 100), run('second line', 56, 115)];
  assert.equal(readingText(runs), 'first line\nsecond line\nthird line');
});

test('runs on the same line are joined, with a space only where there is a gap', () => {
  const runs = [run('lo wor', 56 + 3 * 5.5, 100), run('Hel', 56, 100), run('ld', 56 + 9 * 5.5, 100), run('more', 56 + 12 * 5.5 + 12, 100)];
  assert.equal(readingText(runs), 'Hello world more');
});

test('two columns drawn line by line are read column by column', () => {
  const left = column('L', 56, 100, 6);
  const right = column('R', 310, 100, 6);
  const interleaved = left.flatMap((item, i) => [item, right[i]]);
  const text = readingText(interleaved).split('\n');
  assert.deepEqual(text.filter((line) => line.startsWith('L-')).map((line) => line.slice(0, 3)), ['L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6']);
  assert.ok(text.findIndex((line) => line.startsWith('L-6')) < text.findIndex((line) => line.startsWith('R-1')), 'the left column ends before the right one starts');
  assert.ok(text.every((line) => !(line.includes('L-') && line.includes('R-'))), 'a line never holds text of both columns');
});

test('a header across the page comes first, then the columns, then a footer', () => {
  const header = run('Bulletin of information number one for the whole page', 56, 60, 22);
  const left = column('L', 56, 120, 4);
  const right = column('R', 310, 120, 4);
  const footer = run('Page 1', 280, 400);
  const text = readingText([footer, ...right, ...left.slice().reverse(), header]).split('\n');
  assert.ok(text[0].startsWith('Bulletin'));
  assert.deepEqual(text.slice(1).filter((line) => line).map((line) => line.slice(0, 3)), ['L-1', 'L-2', 'L-3', 'L-4', 'R-1', 'R-2', 'R-3', 'R-4', 'Pag']);
});

test('a footer that sits under one column only still comes after both columns', () => {
  const left = column('L', 56, 120, 4);
  const right = column('R', 310, 120, 4);
  const text = readingText([...left, run('Footer note', 56, 400), ...right]).split('\n');
  assert.deepEqual(text.filter((line) => line).map((line) => line.slice(0, 3)), ['L-1', 'L-2', 'L-3', 'L-4', 'R-1', 'R-2', 'R-3', 'R-4', 'Foo']);
});

test('a table is read row by row, not column by column', () => {
  const rows = [['Date', 'Designation', 'Amount'], ['01/11', 'Membership', '45,00'], ['02/11', 'Fees', '90,00'], ['03/11', 'Membership', '135,00']];
  const runs = rows.flatMap((cells, i) => [run(cells[0], 56, 200 + i * 22), run(cells[1], 160, 200 + i * 22), run(cells[2], 450, 200 + i * 22)]);
  assert.equal(readingText(runs.reverse()), 'Date Designation Amount\n\n01/11 Membership 45,00\n\n02/11 Fees 90,00\n\n03/11 Membership 135,00');
  const tight = rows.flatMap((cells, i) => [run(cells[0], 56, 200 + i * 15), run(cells[1], 160, 200 + i * 15), run(cells[2], 450, 200 + i * 15)]);
  assert.equal(readingText(tight), 'Date Designation Amount\n01/11 Membership 45,00\n02/11 Fees 90,00\n03/11 Membership 135,00');
});

test('columns whose paragraphs line up, right above a table, are still read column by column', () => {
  // Two columns of three paragraphs of four lines each, the paragraphs starting on the same lines, then a table 12 points below.
  const paragraphs = (label, x) => [0, 1, 2].flatMap((p) => Array.from({ length: 4 }, (_, i) => run(`${label}${p + 1}.${i + 1} words of the paragraph`, x, 100 + p * 85 + i * 15)));
  const left = paragraphs('L', 56);
  const right = paragraphs('R', 310);
  const table = [0, 1, 2].flatMap((i) => [run(`0${i}/11`, 56, 365 + i * 15), run(`Membership fee ${i} for the whole year of work`, 160, 365 + i * 15), run('45,00', 450, 365 + i * 15)]);
  const interleaved = left.flatMap((item, i) => [item, right[i]]);
  const text = readingText([...table, ...interleaved, run('Left heading', 56, 80), run('Right heading', 310, 80)]).split('\n').filter((line) => line);
  const labels = text.map((line) => line.split(' ')[0]);
  assert.deepEqual(labels, ['Left', ...[0, 1, 2].flatMap((p) => [1, 2, 3, 4].map((i) => `L${p + 1}.${i}`)), 'Right', ...[0, 1, 2].flatMap((p) => [1, 2, 3, 4].map((i) => `R${p + 1}.${i}`)), '00/11', '01/11', '02/11']);
  assert.equal(text.at(-1), '02/11 Membership fee 2 for the whole year of work 45,00');
});

test('two columns whose lines do not sit on the same baselines are still two columns', () => {
  const left = column('L', 56, 100, 5);
  const right = column('R', 310, 107, 5);
  const text = readingText([...right, ...left]).split('\n').filter((line) => line).map((line) => line.slice(0, 3));
  assert.deepEqual(text, ['L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'R-1', 'R-2', 'R-3', 'R-4', 'R-5'], 'five lines of the left column, then five of the right');
});

test('a blank line separates two paragraphs of a column', () => {
  const runs = [run('one', 56, 100), run('two', 56, 115), run('three', 56, 140), run('four', 56, 155), run('five', 56, 170), run('six', 56, 185)];
  assert.equal(readingText(runs), 'one\ntwo\n\nthree\nfour\nfive\nsix');
});

test('a page with no text, or only spaces, gives an empty text', () => {
  assert.equal(readingText([]), '');
  assert.equal(readingText([run('   ', 56, 100)]), '');
});
