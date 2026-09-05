import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  ssr: true,
  modules: ['@nuxt/eslint', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: 'Akapela',
      htmlAttrs: { lang: 'en', class: 'dark' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#121212' },
      ],
    },
  },
  runtimeConfig: {
    dataDir: './data',
    migrationsDir: './server/db/migrations',
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Akapela',
      short_name: 'Akapela',
      description: 'Self-hosted karaoke: import, sing, mix.',
      theme_color: '#121212',
      background_color: '#121212',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // The app is server-rendered with no prerendered pages, so there is no
      // precached document to fall back to. Navigations always hit the server.
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,woff2,png,svg}'],
    },
    devOptions: { enabled: false },
  },
  nitro: {
    experimental: { tasks: false },
  },
})
