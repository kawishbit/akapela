export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system']
export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

const THEME_STORAGE_KEY = 'akapela:theme'

/**
 * The preference on disk, or 'system' when nothing usable is there — the same
 * shape `writeStoredThemePreference` leaves behind for "follow the system",
 * so a browser that has never chosen and one that explicitly chose System
 * read back identically.
 */
export function readStoredThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  }
  catch {
    // Private browsing or storage disabled; falls back to the system's own.
    return 'system'
  }
}

/** Persists an explicit choice, or clears it so the system's own preference is what's followed. */
export function writeStoredThemePreference(storage: Pick<Storage, 'setItem' | 'removeItem'>, preference: ThemePreference): void {
  try {
    if (preference === 'system') storage.removeItem(THEME_STORAGE_KEY)
    else storage.setItem(THEME_STORAGE_KEY, preference)
  }
  catch {
    // Private browsing or storage disabled; the choice just won't stick.
  }
}

/** What actually gets painted: the explicit preference, or the system's own when left on 'system'. */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): Theme {
  if (preference === 'light' || preference === 'dark') return preference
  return systemPrefersLight ? 'light' : 'dark'
}
