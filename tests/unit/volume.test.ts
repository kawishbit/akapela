import { afterEach, describe, expect, test } from 'vitest'
import { DEFAULT_VOLUME, VOLUME_MAX, VOLUME_MIN, VolumeStore, clampVolume } from '../../app/audio/volume'

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

describe('clampVolume', () => {
  test('passes values already in range through unchanged', () => {
    expect(clampVolume(0)).toBe(0)
    expect(clampVolume(0.5)).toBe(0.5)
    expect(clampVolume(1)).toBe(1)
  })

  test('clamps out-of-range input to the nearest bound', () => {
    expect(clampVolume(-1)).toBe(VOLUME_MIN)
    expect(clampVolume(1.5)).toBe(VOLUME_MAX)
  })

  test('falls back to the default for a non-finite input', () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME)
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VOLUME)
  })
})

describe('VolumeStore', () => {
  test('loads once from storage, then answers from memory on every later call', () => {
    const storage = fakeLocalStorage()
    storage.setItem('akapela:volume', '0.4')
    globalThis.localStorage = storage

    const store = new VolumeStore()
    expect(store.ensureLoaded()).toBe(0.4)

    // A later change on disk (another tab, say) is not picked up — memory won.
    storage.setItem('akapela:volume', '0.9')
    expect(store.ensureLoaded()).toBe(0.4)
  })

  test('defaults to unity when nothing has ever been stored', () => {
    globalThis.localStorage = fakeLocalStorage()
    expect(new VolumeStore().ensureLoaded()).toBe(DEFAULT_VOLUME)
  })

  test('set clamps, persists, and answers what was actually stored', () => {
    const storage = fakeLocalStorage()
    globalThis.localStorage = storage

    const store = new VolumeStore()
    expect(store.set(1.4)).toBe(VOLUME_MAX)
    expect(storage.getItem('akapela:volume')).toBe(String(VOLUME_MAX))

    expect(store.set(-0.2)).toBe(VOLUME_MIN)
    expect(storage.getItem('akapela:volume')).toBe(String(VOLUME_MIN))
  })

  test('set marks the store as loaded, so a later ensureLoaded does not overwrite it from storage', () => {
    const storage = fakeLocalStorage()
    globalThis.localStorage = storage

    const store = new VolumeStore()
    store.set(0.3)
    // Storage disagrees (as if another tab wrote something else); this store already has its own value.
    storage.setItem('akapela:volume', '0.8')
    expect(store.ensureLoaded()).toBe(0.3)
  })

  test('a missing or unavailable localStorage fails open to the default, on both read and write', () => {
    // No globalThis.localStorage at all, the way this suite's environment starts.
    const store = new VolumeStore()
    expect(store.ensureLoaded()).toBe(DEFAULT_VOLUME)
    expect(() => store.set(0.5)).not.toThrow()
    expect(store.set(0.5)).toBe(0.5)
  })
})
