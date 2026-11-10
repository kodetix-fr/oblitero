import test from 'node:test';
import assert from 'node:assert/strict';
import { burnKey, eachFile, outlineOf } from './page-output.js';
import { Failure } from './i18n.js';

test('one result per file, one after the other: a file that fails is reported and the others still come out', async () => {
  const groups = ['a', 'b', 'bad', 'c', 'd'].map((name) => ({ name: `${name}.pdf`, entries: [name] }));
  let running = 0;
  const result = await eachFile(groups, async ([name]) => {
    assert.equal(++running, 1, 'two files at once');
    await new Promise((resolve) => setTimeout(resolve, 1));
    running--;
    if (name === 'bad') throw new Failure('error.page-large');
    return new Blob([name]);
  });
  assert.deepEqual(result.files.map((file) => file.name), ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
  assert.equal(result.failed, 1);
  assert.equal(result.report.length, 5);
  assert.match(result.report[2], /bad\.pdf.*too large/);
});

const base = { file: 0, source: 0, rotation: 0, angle: 0, flip: false, redactions: [{ x: 0, y: 0, w: 0.5, h: 0.5 }] };
const crop = { x: 0, y: 0, w: 0.5, h: 0.5 };
const text = (value) => ({ kind: 'text', text: value, x: 0, y: 0, size: 0.02, turn: 0 });

test('burnKey: marks tell two cropped pages apart only when the crop removes what is outside', () => {
  const removed = { ...base, crop: { ...crop, remove: true } };
  assert.notEqual(burnKey({ ...removed, marks: [text('a')] }), burnKey({ ...removed, marks: [text('b')] }));
  assert.equal(burnKey({ ...removed, marks: [text('a')] }), burnKey({ ...removed, marks: [text('a')] }));
  const kept = { ...base, crop: { ...crop, remove: false } };
  assert.equal(burnKey({ ...kept, marks: [text('a')] }), burnKey({ ...kept, marks: [text('b')] }));
});

test('burnKey: a picture mark is told by identity, not by its bytes', () => {
  const entry = { ...base, crop: { ...crop, remove: true } };
  const image = (png) => ({ kind: 'image', png, x: 0, y: 0, w: 0.1, h: 0.1, turn: 0 });
  const png = new Uint8Array([1, 2, 3]);
  assert.equal(burnKey({ ...entry, marks: [image(png)] }), burnKey({ ...entry, marks: [image(png)] }));
  assert.notEqual(burnKey({ ...entry, marks: [image(png)] }), burnKey({ ...entry, marks: [image(new Uint8Array([1, 2, 3]))] }));
});

test('outlineOf: the outline is read once, and a read that failed is made again', async () => {
  const document = { doc: {}, outline: null };
  let reads = 0;
  const read = async () => {
    if (++reads === 1) throw new Error('unreadable');
    return [{ title: 'One', page: 0, items: [] }];
  };
  await assert.rejects(outlineOf(document, read), /unreadable/);
  assert.equal(document.outline, null);
  assert.equal((await outlineOf(document, read))[0].title, 'One');
  await outlineOf(document, read);
  assert.equal(reads, 2);
});
