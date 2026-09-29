import { LANGUAGE_COOKIE, parseAcceptLanguage, resolveLanguage, type Language } from '~/utils/language'

/**
 * Settles the Language before the first paint, so the server renders the page
 * in it and the browser hydrates in the same one — no flash of English. The
 * cookie wins when the singer has picked; otherwise the server reads
 * `Accept-Language`, and the browser takes the server's answer from the
 * payload rather than guessing again from `navigator.languages`.
 *
 * `@nuxtjs/i18n`'s own detection is off (`nuxt.config.ts`), since it writes
 * its cookie whenever it detects and Automatic would then stick. This only
 * reads; `useLanguage().setPreference` is what writes.
 */
export default defineNuxtPlugin({
  name: 'akapela:language',
  enforce: 'pre',
  setup(nuxtApp) {
    const initial = useState<Language | null>('akapela:initial-language', () => null)
    if (!initial.value) {
      const cookie = useCookie<string | null>(LANGUAGE_COOKIE).value
      const preferred = import.meta.server
        ? parseAcceptLanguage(useRequestHeader('accept-language'))
        : navigator.languages
      initial.value = resolveLanguage(cookie, preferred)
    }

    // The module reports every switch as its initial setup under `no_prefix`,
    // so only the first is this plugin's to decide; the rest are the singer's.
    let settled = false
    nuxtApp.hook('i18n:beforeLocaleSwitch', (switching) => {
      if (settled || !switching.initialSetup) return
      settled = true
      switching.newLocale = initial.value!
    })
  },
})
