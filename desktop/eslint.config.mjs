// @ts-check

// `desktop/` is its own package with its own lint script, the way `apphost/`
// is — the root ESLint config ignores it, because the root `pnpm install` (the
// one the Dockerfile runs) must never see Electron.

import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // `staging/` belongs here for the same reason as `release/`: it is build
  // output `prepack.ts` writes, it carries the server bundle's own
  // `eslint-disable` comments for rules this config does not define, and flat
  // config does not read `.gitignore` — which already lists it.
  globalIgnores(['dist/**', 'vendor/**', 'release/**', 'staging/**', 'node_modules/**']),
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
