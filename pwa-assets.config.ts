import { defineConfig } from '@vite-pwa/assets-generator/config'

// The source mark (public/logo.svg, from logos/logo.svg) is a full-bleed
// square with its own built-in safe margin around the glyph, so every size
// is a plain resize: no extra padding, and a background matching the mark
// exactly in case rounding ever needs to fill a sliver at the edge.
const flat = { padding: 0, resizeOptions: { fit: 'contain' as const, background: '#87ea5c' } }

export default defineConfig({
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], ...flat },
    maskable: { sizes: [512], ...flat },
    apple: { sizes: [180], ...flat },
  },
  images: ['public/logo.svg'],
})
