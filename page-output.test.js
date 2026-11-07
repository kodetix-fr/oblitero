import test from 'node:test';
import assert from 'node:assert/strict';
import { eachFile } from './page-output.js';

test('one result per file, one after the other: a file that fails is reported and the others still come out', async () => {
  const groups = ['a', 'b', 'bad', 'c', 'd'].map((name) => ({ name: `${name}.pdf`, entries: [name] }));
  let running = 0;
  const result = await eachFile(groups, async ([name]) => {
    assert.equal(++running, 1, 'two files at once');
    await new Promise((resolve) => setTimeout(resolve, 1));
    running--;
    if (name === 'bad') throw new Error('broken');
    return new Blob([name]);
  });
  assert.deepEqual(result.files.map((file) => file.name), ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
  assert.equal(result.failed, 1);
  assert.equal(result.report.length, 5);
  assert.match(result.report[2], /bad\.pdf.*broken/);
});
