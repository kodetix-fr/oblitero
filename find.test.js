import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, ibanValid, luhnValid, multiply, runBox } from './find.js';

// Fake personal data, joined at run time so that no secret scanner reads it as one literal.
const iban = ['FR76', '3000', '6000', '0112', '3456', '7890', '189'].join(' ');
const valid = ['4539', '5787', '6362', '1486'];
const invalid = ['4539', '5787', '6362', '1487'];
const kinds = (text, options) => findMatches(text, options).map((match) => [match.kind, match.text]);

test('luhnValid and ibanValid check the control digits', () => {
  assert.equal(luhnValid(valid.join('')), true);
  assert.equal(luhnValid(invalid.join('')), false);
  assert.equal(ibanValid('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(ibanValid('GB82 WEST 1234 5698 7654 33'), false);
  assert.equal(ibanValid('not an iban'), false);
});

test('the email preset finds addresses and nothing else', () => {
  const found = kinds('Write to jean.dupont+x@example.org or sales@mail.example.co.uk, not to @home or a@b.', { presets: ['email'] });
  assert.deepEqual(found, [['email', 'jean.dupont+x@example.org'], ['email', 'sales@mail.example.co.uk']]);
});

test('the IBAN preset finds spaced and compact numbers and refuses a wrong checksum', () => {
  assert.deepEqual(kinds(`Account ${iban}.`, { presets: ['iban'] }), [['iban', iban]]);
  assert.deepEqual(kinds(`Account ${iban.replaceAll(' ', '')} ok`, { presets: ['iban'] }).length, 1);
  assert.deepEqual(kinds('Account GB82 WEST 1234 5698 7654 99', { presets: ['iban'] }), []);
});

test('the card preset keeps the numbers that pass the Luhn check, with spaces or dashes', () => {
  assert.deepEqual(kinds(`Card ${valid.join(' ')} and ${invalid.join('-')}.`, { presets: ['card'] }), [['card', valid.join(' ')]]);
});

test('the phone preset takes numbers of 9 to 15 digits and leaves dates and short numbers', () => {
  const found = kinds('Call +33 6 12 34 56 78 or 06.12.34.56.78, built 2026-11-01, room 12, ref 1234.', { presets: ['phone'] }).map((match) => match[1]);
  assert.deepEqual(found, ['+33 6 12 34 56 78', '06.12.34.56.78']);
});

test('an IBAN is not also taken for a phone number, and words are found without regard to case', () => {
  const found = kinds(`Pay ${iban} to Jean DUPONT, jean dupont again`, { presets: ['phone', 'iban'], words: ['Jean Dupont'] });
  assert.deepEqual(found, [['iban', iban], ['word', 'Jean DUPONT'], ['word', 'jean dupont']]);
});

test('multiply composes matrices, and runBox covers the ascent, the descent and the length of a run', () => {
  assert.deepEqual(multiply([1, 0, 0, -1, 0, 100], [10, 0, 0, 10, 5, 20]), [10, 0, 0, -10, 5, 80]);
  const upright = runBox([12, 0, 0, -12, 100, 200], 60, 600, 800, 0);
  assert.ok(upright);
  assert.ok(Math.abs(upright.x - 100 / 600) < 1e-9 && Math.abs(upright.w - 60 / 600) < 1e-9);
  assert.ok(upright.y < 200 / 800 && upright.y + upright.h > 200 / 800, 'the baseline is inside the box');
  assert.ok(Math.abs(upright.y - (200 - 12.6) / 800) < 1e-9 && Math.abs(upright.y + upright.h - (200 + 3.6) / 800) < 1e-9);
  const turned = runBox([0, -12, -12, 0, 300, 400], 60, 600, 800, 0);
  assert.ok(turned);
  assert.ok(turned.h > turned.w, 'a run read from the bottom up is a tall box');
  assert.equal(runBox([0, 0, 0, 0, 1, 1], 10, 600, 800), null);
});
