import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'tmp/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/site/assets/app.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    files: ['tests/browser/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
