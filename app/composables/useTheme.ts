import { type Theme, type ThemePreference, readStoredThemePreference, resolveTheme, writeStoredThemePreference } from '~/utils/theme'

// One `matchMedia` listener per window, the same singleton-on-first-use shape
// `usePlayer`'s engine follows: guards the setup below to once per page load
// no matter how many components call `useTheme`.
let media: MediaQueryList | undefined

/**
 * The theme in force: an explicit choice remembered per-device in
 * `localStorage`, or the system's own when left on 'system' — never sent to
 * the server, the same way the Backing Track volume already isn't. The
 * blocking script in `nuxt.config.ts` paints the right theme before this
 * ever runs; this keeps it in sync afterward, including a live system change.
 */
export function useTheme() {
  const preference = useState<ThemePreference>('theme-preference', () => 'system')
  const systemPrefersLight = useState<boolean>('theme-system-prefers-light', () => false)

  if (import.meta.client && !media) {
    preference.value = readStoredThemePreference(localStorage)
    media = window.matchMedia('(prefers-color-scheme: light)')
    systemPrefersLight.value = media.matches
    media.addEventListener('change', (event) => {
      systemPrefersLight.value = event.matches
    })
  }

  /** Remembers an explicit Light/Dark choice, or clears back to following the system. */
  function setPreference(next: ThemePreference): void {
    preference.value = next
    writeStoredThemePreference(localStorage, next)
  }

  return {
    preference: computed(() => preference.value),
    theme: computed<Theme>(() => resolveTheme(preference.value, systemPrefersLight.value)),
    setPreference,
  }
}
