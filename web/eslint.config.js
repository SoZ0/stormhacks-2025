import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
  {
    ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/', 'static/'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
  {
    files: ['*.config.*'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];
