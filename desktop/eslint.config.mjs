// @ts-check

// `desktop/` is its own package with its own lint script, the way `apphost/`
// is — the root ESLint config ignores it, because the root `pnpm install` (the
// one the Dockerfile runs) must never see Electron.

import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'vendor/**', 'release/**', 'node_modules/**']),
  {
    files: ['src/**/*.ts', 'src/**/*.cts', 'scripts/**/*.ts'],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
