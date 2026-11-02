import js from '@eslint/js';
import globals from 'globals';

const NO_HTML = 'Forbidden: interprets HTML (file names flow through the UI). Use textContent, createElement or replaceChildren.';
const HTML_SINKS = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'createContextualFragment', 'setHTMLUnsafe', 'parseHTMLUnsafe'];

const WORKER = ['sw.js'];
const NODE = ['**/*.test.js', 'eslint.config.js', 'test/**/*.mjs', 'scripts/**/*.mjs'];

export default [
  { ignores: ['vendor/', 'dist/', 'node_modules/', 'coverage/'] },

  js.configs.recommended,

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        ...HTML_SINKS.map((property) => ({ property, message: NO_HTML })),
        { object: 'document', property: 'write', message: NO_HTML },
        { object: 'document', property: 'writeln', message: NO_HTML },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `ObjectPattern > Property[key.name=/^(${HTML_SINKS.join('|')})$/]`,
          message: NO_HTML,
        },
      ],
    },
  },

  {
    files: ['**/*.js'],
    ignores: [...WORKER, ...NODE],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
  },
  {
    files: WORKER,
    languageOptions: { globals: { ...globals.serviceworker, chrome: 'readonly' } },
  },
  {
    files: NODE,
    languageOptions: { globals: globals.node },
  },
  // Functions passed to page.evaluate run in the browser.
  {
    files: ['test/**/*.mjs', 'scripts/draw-test-images.mjs'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
  },
];
