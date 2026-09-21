import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'

const repo = new URL('../', import.meta.url)
const publicDir = new URL('./public/', import.meta.url)

// Files the Website shares with the rest of the repo, copied into `public/`
// on every `astro dev` and `astro build` rather than committed a second time.
// Vercel clones the whole repo, so they are there to copy from even with the
// project's Root Directory set to `site/`. Every copy is in `site/.gitignore`.
const shared = {
  // The README's demo, as it is: not re-encoded.
  'assets/readme/demo.mp4': 'demo.mp4',
  // The app's own font, favicon, and logo, so the two never drift apart.
  'app/assets/fonts/figtree-latin.woff2': 'fonts/figtree-latin.woff2',
  'app/assets/fonts/figtree-latin-ext.woff2': 'fonts/figtree-latin-ext.woff2',
  'public/favicon.ico': 'favicon.ico',
  'public/logo.svg': 'logo.svg',
  'public/apple-touch-icon-180x180.png': 'apple-touch-icon.png',
}

/** @returns {import('astro').AstroIntegration} */
function copySharedFiles() {
  return {
    name: 'akapela:copy-shared-files',
    hooks: {
      'astro:config:setup': () => {
        for (const [from, to] of Object.entries(shared)) {
          const target = fileURLToPath(new URL(to, publicDir))
          mkdirSync(dirname(target), { recursive: true })
          copyFileSync(fileURLToPath(new URL(from, repo)), target)
        }
      },
    },
  }
}

export default defineConfig({
  site: 'https://akapela.kawishbit.com',
  integrations: [copySharedFiles()],
  // One static page, nothing to prefetch and no client framework.
  prefetch: false,
  devToolbar: { enabled: false },
})
