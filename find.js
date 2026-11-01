export const PRESETS = [
  ['email', 'E-mail addresses'],
  ['phone', 'Phone numbers'],
  ['iban', 'IBAN'],
  ['card', 'Card numbers'],
];

const digitsOf = (text) => text.replace(/\D/g, '');

export function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function ibanValid(text) {
  const iban = text.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of moved) remainder = Number(String(remainder) + (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55))) % 97;
  return remainder === 1;
}

const FINDERS = {
  email: { pattern: /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi, valid: () => true },
  iban: { pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{3,4}){3,8}\b/g, valid: ibanValid },
  card: { pattern: /\b\d(?:[ -]?\d){12,18}\b/g, valid: (text) => luhnValid(digitsOf(text)) },
  phone: { pattern: /(?:\+|\b00)?\(?\d{1,4}\)?(?:[ .-]?\d{1,4}){3,6}\b/g, valid: (text) => digitsOf(text).length >= 9 && digitsOf(text).length <= 15 },
};
const ORDER = ['email', 'iban', 'card', 'phone'];

// The places of `text` that the presets and the words recognize, in order, without overlap: when two kinds claim the same
// characters, the one tried first keeps them (an IBAN is not also a phone number).
export function findMatches(text, { presets = [], words = [] } = {}) {
  const found = [];
  const taken = [];
  const free = (start, end) => !taken.some(([from, to]) => start < to && end > from);
  const keep = (kind, start, end) => {
    if (!free(start, end)) return;
    taken.push([start, end]);
    found.push({ kind, start, end, text: text.slice(start, end) });
  };
  for (const kind of ORDER.filter((id) => presets.includes(id))) {
    const { pattern, valid } = FINDERS[kind];
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      if (valid(match[0])) keep(kind, match.index, match.index + match[0].length);
    }
  }
  const lower = text.toLowerCase();
  for (const word of words.map((item) => item.trim().toLowerCase()).filter(Boolean)) {
    for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + word.length)) keep('word', at, at + word.length);
  }
  return found.sort((a, b) => a.start - b.start);
}

// The product of two PDF matrices [a, b, c, d, e, f]: `first` applied after `second`, as PDF.js Util.transform does.
export function multiply(first, second) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

// The box of a text run, as a fraction of the displayed page: `matrix` puts the run in viewport pixels (baseline start at
// e, f), `width` is its length in pixels, and the box covers the ascent and the descent, with `pad` pixels around.
// A run that is turned gets the box that holds its four corners.
export function runBox(matrix, width, viewportWidth, viewportHeight, pad = 2) {
  const size = Math.hypot(matrix[2], matrix[3]);
  if (!size || !width) return null;
  const along = [matrix[0] / Math.hypot(matrix[0], matrix[1]), matrix[1] / Math.hypot(matrix[0], matrix[1])];
  const up = [matrix[2] / size, matrix[3] / size];
  const from = -(0.3 * size + pad);
  const to = 1.05 * size + pad;
  const corners = [
    [from, -pad],
    [from, width + pad],
    [to, -pad],
    [to, width + pad],
  ].map(([rise, run]) => [matrix[4] + along[0] * run + up[0] * rise, matrix[5] + along[1] * run + up[1] * rise]);
  const xs = corners.map((corner) => corner[0]);
  const ys = corners.map((corner) => corner[1]);
  const left = Math.max(0, Math.min(...xs));
  const top = Math.max(0, Math.min(...ys));
  const right = Math.min(viewportWidth, Math.max(...xs));
  const bottom = Math.min(viewportHeight, Math.max(...ys));
  if (right <= left || bottom <= top) return null;
  return { x: left / viewportWidth, y: top / viewportHeight, w: (right - left) / viewportWidth, h: (bottom - top) / viewportHeight };
}
