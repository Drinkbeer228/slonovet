import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Проверка кода: правила TypeScript и хуков React. Запускается в npm run lint и при каждой выкладке.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
);
