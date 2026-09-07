/**
 * Backing Track playback volume (ticket 11). A listening preference, not an
 * Adjustment: it never reaches the server, is never stored on a Track, a
 * Take, or a Mix, and never touches Presets, Effects, or the worker's render.
 * It lives entirely in the browser, remembered per-device across reloads the
 * same way the Review screen's latency nudge already is (`localStorage`, not
 * synced across devices).
 */

export const VOLUME_MIN = 0
export const VOLUME_MAX = 1
/** Unity: today's unadjusted loudness, matching every Track before this ticket. */
export const DEFAULT_VOLUME = 1

const VOLUME_STORAGE_KEY = 'akapela:volume'

/** Clamps to the playable range, and to the default when the input is not a usable number. */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, value))
}

function loadRememberedVolume(): number {
  try {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY)
    return stored === null ? DEFAULT_VOLUME : clampVolume(Number(stored))
  }
  catch {
    // Private browsing or storage disabled; the default just won't stick.
    return DEFAULT_VOLUME
  }
}

function saveRememberedVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume))
  }
  catch {
    // Private browsing or storage disabled; the choice just won't stick.
  }
}

/**
 * Owns the load-once-per-window invariant `usePlayer` needs: the first read
 * pulls from `localStorage`, every one after returns what is already in
 * memory, and every write clamps and persists. Plain and stateful rather than
 * a Vue ref so it can be constructed fresh, and tested directly, outside a
 * component.
 */
export class VolumeStore {
  private loaded = false
  private current = DEFAULT_VOLUME

  /** The remembered volume: read from storage on the very first call, from memory on every one after. */
  ensureLoaded(): number {
    if (!this.loaded) {
      this.current = loadRememberedVolume()
      this.loaded = true
    }
    return this.current
  }

  /** Clamps, remembers, and returns what was actually set. */
  set(volume: number): number {
    this.current = clampVolume(volume)
    this.loaded = true
    saveRememberedVolume(this.current)
    return this.current
  }
}
