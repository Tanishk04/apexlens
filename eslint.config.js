// @ts-check
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'branding/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Only the two classic hooks rules — eslint-plugin-react-hooks v7's
      // "recommended" pulls in the full React Compiler rule set (immutability,
      // refs, set-state-in-effect, etc.), which flags a lot of idiomatic,
      // correct pre-Compiler React code as a much bigger, separate initiative
      // than what this pass is after: real exhaustive-deps bugs.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
