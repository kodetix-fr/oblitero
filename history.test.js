import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from './history.js';

test('undo and redo walk back and forth through the states', () => {
  const history = createHistory();
  history.push('a');
  history.push('b');
  assert.equal(history.undo('c'), 'b');
  assert.equal(history.undo('b'), 'a');
  assert.equal(history.undo('a'), null);
  assert.equal(history.redo('a'), 'b');
  assert.equal(history.redo('b'), 'c');
  assert.equal(history.redo('c'), null);
});

test('a new change forgets what could be redone', () => {
  const history = createHistory();
  history.push('a');
  history.undo('b');
  assert.equal(history.canRedo, true);
  history.push('c');
  assert.equal(history.canRedo, false);
  assert.equal(history.canUndo, true);
});

test('the oldest states are dropped past the limit, and clear empties both sides', () => {
  const history = createHistory(2);
  for (const state of ['a', 'b', 'c']) history.push(state);
  assert.equal(history.undo('d'), 'c');
  assert.equal(history.undo('c'), 'b');
  assert.equal(history.undo('b'), null);
  history.clear();
  assert.equal(history.canUndo || history.canRedo, false);
});
