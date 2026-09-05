import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  // Nuxt replaces `import.meta.dev` at build time — `true` when it builds the
  // dev server, `false` when it builds `.output`. Nothing replaces it here, so
  // say so: the code under test is the code `nuxt dev` runs, and the branches
  // that only exist in the production build are proved by what is absent from
  // `.output` rather than by a test.
  define: { 'import.meta.dev': 'true' },
  resolve: {
    // What Nuxt calls the project root, so app code under test can import from
    // `shared/` by the same specifier it uses when Nuxt builds it.
    alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
