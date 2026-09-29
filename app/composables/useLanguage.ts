import { LANGUAGE_COOKIE, browserLanguage, isLanguage, type Language } from '~/utils/language'

/** What the Language picker offers: follow the browser, or one Language by name. */
export type LanguagePreference = Language | 'automatic'

/**
 * The Language in force on this device, and the singer's choice of it. Kept in
 * a cookie so the server can render in it, and never sent anywhere else: it is
 * not a server Setting, so two devices can hold two Languages at once.
 */
export function useLanguage() {
  const { locale, setLocale } = useI18n()
  const cookie = useCookie<string | null>(LANGUAGE_COOKIE, {
    maxAge: 60 * 60 * 24 * 365 * 5,
    sameSite: 'lax',
    path: '/',
  })

  const preference = computed<LanguagePreference>(() => isLanguage(cookie.value) ? cookie.value : 'automatic')

  /** Remembers a Language for this device, or clears the choice so the browser's applies again. */
  async function setPreference(next: LanguagePreference): Promise<void> {
    cookie.value = next === 'automatic' ? null : next
    await setLocale(next === 'automatic' ? browserLanguage(navigator.languages) : next)
  }

  return {
    language: computed(() => locale.value as Language),
    preference,
    setPreference,
  }
}
