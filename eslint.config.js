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
    files: ['src/ui/client/**/*.js', 'src/ui/shared/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ENAGA_SITE: 'readonly' } },
  },
  {
    files: ['tests/browser/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
