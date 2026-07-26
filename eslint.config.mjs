export default [
  {
    // frontend/ has its own eslint.config.mjs and CI job; eslint 10's
    // nearest-config lookup would otherwise lint it from the root run,
    // which needs frontend/node_modules that the backend CI job doesn't install.
    ignores: ['frontend/'],
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
];
