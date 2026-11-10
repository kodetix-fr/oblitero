// Runtime translation. A flat key -> text map per language; the user picks the language (or follows the browser).
// No DOM and no chrome.* here: it runs the same in the page and in the Node tests.
// English is always loaded (the fallback of every other language); another language is loaded when it is needed
// (loadLanguage imports locales/<code>.js). t() stays synchronous.
// Add a language: its code and name in languages.js, its texts in locales/<code>.js, its _locales/<code>/messages.json.
import en from './locales/en.js';
import { LANGUAGES, pluralForm } from './languages.js';

export { LANGUAGES, pluralForm, resolveLanguage } from './languages.js';

/** @type {Record<string, Record<string, string>>} */
const DICTIONARIES = { en };

let current = 'en';

/** Are the texts of this language loaded? @param {string} lang */
export const hasLanguage = (lang) => Object.hasOwn(DICTIONARIES, lang);

/**
 * Loads the texts of a language (locales/<code>.js), once. Resolves to the language that can be used: `lang`, or English
 * when it is not a language of the extension or its file cannot be loaded (never rejects: a page always has texts).
 * @param {string} lang
 * @returns {Promise<string>}
 */
export async function loadLanguage(lang) {
  if (hasLanguage(lang)) return lang;
  if (!Object.hasOwn(LANGUAGES, lang)) return 'en';
  try {
    DICTIONARIES[lang] = (await import(`./locales/${lang}.js`)).default;
    return lang;
  } catch {
    return 'en';
  }
}

/** @param {string} lang A loaded language (loadLanguage); another one gives English. @returns {string} the language really in use */
export function setLanguage(lang) {
  current = hasLanguage(lang) ? lang : 'en';
  return current;
}

export const getLanguage = () => current;

/**
 * t('key') or t('key', { n: 3 }) which replaces {n}. A missing key falls back to English, then to the key itself:
 * visible on screen and in tests, never an exception.
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars) {
  const text = DICTIONARIES[current][key] ?? DICTIONARIES.en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m)) : text;
}

/** An error whose text is ready for the user, in the language of the moment: any other error comes from a library, in English. */
export class Failure extends Error {
  /** @param {string} key @param {Record<string, string | number>} [vars] */
  constructor(key, vars) {
    super(t(key, vars));
  }
}

/** What to tell the user about an error: its own text for a Failure, a sentence for any other, which goes to the console. */
export function failureText(error) {
  if (error instanceof Failure) return error.message;
  console.error('Oblitero:', error);
  return t('error.unknown');
}

/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();

/** @param {number} n */
export function formatNumber(n) {
  let format = numberFormats.get(current);
  if (!format) numberFormats.set(current, (format = new Intl.NumberFormat(current)));
  return format.format(n);
}

/** A share of 0 to 1 as a percentage with two significant digits, in the language in use. @param {number} ratio */
export function formatPercent(ratio) {
  return new Intl.NumberFormat(current, { style: 'percent', maximumSignificantDigits: 2 }).format(ratio);
}

/** A number with exactly `digits` decimals, in the language in use. @param {number} n @param {number} digits */
export function formatFixed(n, digits) {
  return new Intl.NumberFormat(current, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/**
 * The text of a key that has a singular and a plural form, with {n} the formatted number.
 * @param {number} n
 * @param {string} one key
 * @param {string} other key
 * @param {Record<string, string | number>} [vars]
 */
export const plural = (n, one, other, vars) => t(pluralForm(current, n) === 'one' ? one : other, { ...vars, n: formatNumber(n) });

/** @param {number} n */
export const pagesOf = (n) => plural(n, 'count.page.one', 'count.page.other');
