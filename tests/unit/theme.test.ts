import { afterEach, describe, expect, test } from 'vitest'
import { readStoredThemePreference, resolveTheme, writeStoredThemePreference } from '../../app/utils/theme'

/** A minimal in-memory `Storage`, since this suite runs without a DOM. */
function fakeLocalStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: key => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

afterEach(() => {
  // @ts-expect-error test-only global, absent by default in this suite's environment
  delete globalThis.localStorage
})

describe('readStoredThemePreference', () => {
  test('reads back an explicit Light or Dark choice', () => {
    const storage = fakeLocalStorage()
    storage.setItem('akapela:theme', 'light')
    expect(readStoredThemePreference(storage)).toBe('light')

    storage.setItem('akapela:theme', 'dark')
    expect(readStoredThemePreference(storage)).toBe('dark')
  })

  test('falls back to system when nothing was ever stored', () => {
    expect(readStoredThemePreference(fakeLocalStorage())).toBe('system')
  })

  test('falls back to system for a value it does not recognize', () => {
    const storage = fakeLocalStorage()
    storage.setItem('akapela:theme', 'sepia')
    expect(readStoredThemePreference(storage)).toBe('system')
  })

  test('a storage that throws on read fails open to system', () => {
    const storage: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('storage disabled')
      },
    }
    expect(readStoredThemePreference(storage)).toBe('system')
  })
})

describe('writeStoredThemePreference', () => {
  test('persists an explicit Light or Dark choice', () => {
    const storage = fakeLocalStorage()
    writeStoredThemePreference(storage, 'light')
    expect(storage.getItem('akapela:theme')).toBe('light')
  })

  test('choosing System clears whatever was stored, rather than writing the literal string', () => {
    const storage = fakeLocalStorage()
    storage.setItem('akapela:theme', 'dark')
    writeStoredThemePreference(storage, 'system')
    expect(storage.getItem('akapela:theme')).toBe(null)
  })

  test('a storage that throws on write does not throw back', () => {
    const storage: Pick<Storage, 'setItem' | 'removeItem'> = {
      setItem: () => {
        throw new Error('storage disabled')
      },
      removeItem: () => {
        throw new Error('storage disabled')
      },
    }
    expect(() => writeStoredThemePreference(storage, 'light')).not.toThrow()
    expect(() => writeStoredThemePreference(storage, 'system')).not.toThrow()
  })
})

describe('resolveTheme', () => {
  test('an explicit preference wins regardless of what the system prefers', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  test('system defers to what the system prefers', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})
