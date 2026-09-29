import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  ssr: true,
  modules: ['@nuxt/eslint', '@vite-pwa/nuxt', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: 'Akapela',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#121212' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
      script: [
        {
          // Runs before first paint so a device set to Light, or a singer
          // who already chose it, never flashes Dark first. `useTheme`
          // (`app/composables/useTheme.ts`) takes over from here once Vue
          // mounts; the storage key and the fallback to `prefers-color-scheme`
          // mirror `app/utils/theme.ts` exactly, but this has to stand alone
          // since it runs outside any bundle.
          innerHTML: `(function(){try{var t=localStorage.getItem('akapela:theme');var theme=(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',theme)}catch(e){}})()`,
        },
      ],
    },
  },
  runtimeConfig: {
    dataDir: './data',
    migrationsDir: './server/db/migrations',
    public: {
      // True only when something is collecting, which under `aspire run` is the
      // Aspire Dashboard. False otherwise, which is what keeps the browser from
      // relaying its console at a server that would only drop it. Read here
      // rather than in the plugin because the browser has no environment to
      // read; this is how the server's answer reaches it.
      telemetryEnabled: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Akapela',
      short_name: 'Akapela',
      description: 'Self-hosted karaoke: import, sing, mix.',
      theme_color: '#121212',
      background_color: '#121212',
      // Installed, the window gives its title bar to the page, which draws
      // the same one the Desktop App does (`TitleBar.vue`); the browser keeps
      // only its own window controls over one end of it. Where the overlay is
      // unsupported — Safari, Firefox, mobile — it is a plain standalone window.
      display_override: ['window-controls-overlay'],
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
  i18n: {
    // One JSON file per Language under `i18n/locales/`, each loaded only when
    // it is used (ADR 0014). English is the source of truth: every key is in
    // `en.json`, and any other Language falls back to it a key at a time.
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'id', language: 'id', name: 'Bahasa Indonesia', file: 'id.json' },
    ],
    defaultLocale: 'en',
    // The Language is per device and never in the URL (ADR 0014 amendment).
    strategy: 'no_prefix',
    // Off because the module writes its cookie the moment it detects a
    // Language, and then "Automatic" could never be told apart from a choice.
    // `app/plugins/language.ts` detects it instead, and only a pick on the
    // Settings page writes the cookie.
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
  },
  nitro: {
    experimental: { tasks: false },
  },
})
