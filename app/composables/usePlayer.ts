import { BackingTrackEngine } from '~/audio/engine'
import { DEFAULT_VOLUME, VolumeStore } from '~/audio/volume'
import type { TrackWithJob } from '~~/server/lib/tracks'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '~~/shared/adjustments'
import { DEFAULT_BACKING_SOURCE, type BackingSource } from '~~/shared/backing-source'

/** What the player bar needs to know about the Track it holds. */
export interface PlayerTrack {
  id: string
  title: string
  artist: string | null
  /** Cache-buster for the cover image, which changes when the cover does. */
  coverVersion: number
}

export interface PlayerState {
  track: PlayerTrack | null
  /**
   * Which of the Track's audio files is decoded and playing. Follows the
   * Track's own, and switching it is a reload rather than a live parameter
   * change — the one Adjustment that is.
   */
  backingSource: BackingSource
  /** Fetching and decoding the Backing Track, including while switching Backing Source. */
  loading: boolean
  error: string | null
  playing: boolean
  positionMs: number
  durationMs: number
  adjustments: Adjustments
  /**
   * A listening preference, not an Adjustment (ticket 11): linear gain on the
   * Backing Track's output, 0 to 1, remembered per-device in `localStorage`
   * rather than on the Track. Never sent to the server.
   */
  volume: number
  /** The last failure to remember Adjustments on the Track; playback carries on regardless. */
  saveError: string | null
}

const SAVE_DEBOUNCE_MS = 300

// One engine, one animation loop, one pending save, and one remembered volume per browser window.
let engine: BackingTrackEngine | undefined
let frameLoop: number | undefined
let pendingSave: { timer: ReturnType<typeof setTimeout>, run: () => void } | undefined
const volumeStore = new VolumeStore()

/**
 * The persistent player: one Track loaded at a time, played through the
 * Backing Track engine, with the Adjustments in force remembered on the Track.
 */
export function usePlayer() {
  const state = useState<PlayerState>('player', () => ({
    track: null,
    backingSource: DEFAULT_BACKING_SOURCE,
    loading: false,
    error: null,
    playing: false,
    positionMs: 0,
    durationMs: 0,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    // Read on the server too, but `VolumeStore` fails open to `DEFAULT_VOLUME`
    // without a `localStorage` to read; the real remembered value loads once
    // the engine is created below, which only ever happens in the browser.
    volume: DEFAULT_VOLUME,
    saveError: null,
  }))

  function getEngine(): BackingTrackEngine {
    if (!engine) {
      state.value.volume = volumeStore.ensureLoaded()
      engine = new BackingTrackEngine({
        onPosition(positionMs, playing) {
          state.value.positionMs = positionMs
          state.value.playing = playing
          if (playing && frameLoop === undefined) frameLoop = requestAnimationFrame(tick)
        },
        onEnded() {
          state.value.playing = false
          state.value.positionMs = state.value.durationMs
        },
        onError(message) {
          state.value.error = message
          state.value.loading = false
          state.value.playing = false
        },
      })
      window.addEventListener('pagehide', flushSave)
    }
    return engine
  }

  function tick() {
    frameLoop = undefined
    if (!engine || !state.value.playing) return
    state.value.positionMs = engine.positionMs
    frameLoop = requestAnimationFrame(tick)
  }

  /** The stream URL naming one of a Track's audio files, rather than whichever it happens to be on. */
  function backingUrl(trackId: string, source: BackingSource): string {
    return `/api/tracks/${trackId}/backing?source=${source}`
  }

  /** Makes a ready Track the player's current one and loads its Backing Track, without starting playback. */
  async function open(track: TrackWithJob): Promise<void> {
    if (import.meta.server) return
    // The bar always shows the Track as it is now: confirming a Song changes
    // the artist and the cover under a Track that is already loaded.
    const display: PlayerTrack = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      coverVersion: track.updatedAt,
    }
    if (state.value.track?.id === track.id && !state.value.error) {
      state.value.track = display
      // The Track's Backing Source moved under a Track that is already loaded:
      // either the singer switched it, or a separation finished and flipped it
      // onto the Instrumental Stem it just wrote. Both are a reload.
      if (track.backingSource !== state.value.backingSource) await switchBackingSource(track.backingSource)
      return
    }
    flushSave()
    state.value.track = display
    state.value.backingSource = track.backingSource
    state.value.adjustments = { ...track.adjustments }
    state.value.positionMs = 0
    state.value.durationMs = track.durationMs ?? 0
    state.value.playing = false
    state.value.loading = true
    state.value.error = null
    state.value.saveError = null
    try {
      const durationMs = await getEngine().load(backingUrl(track.id, track.backingSource), track.adjustments)
      if (durationMs === null) return
      state.value.durationMs = durationMs
      state.value.loading = false
      // The gain stage exists only once the engine's graph has been built by a
      // first load; harmless to repeat on every Track, since it just applies
      // what is already remembered.
      getEngine().setGain(state.value.volume)
    }
    catch (error) {
      if (state.value.track?.id !== track.id) return
      state.value.error = describeError(error)
      state.value.loading = false
    }
  }

  /**
   * Plays the Track's other audio file from the song position it is at. This is
   * the one Adjustment that cannot be a parameter change on a live graph: the
   * other file has to be fetched and decoded, which is seconds of work, so the
   * player says it is loading rather than appearing to hang, and resumes
   * playing if it was.
   *
   * Private, and reached only through `open`, so there is one way a Backing
   * Source changes: the Track is told, and the player follows what the Track
   * says. A switch that never reached the Track would be forgotten on reload.
   */
  async function switchBackingSource(backingSource: BackingSource): Promise<void> {
    const trackId = state.value.track?.id
    if (!trackId) return
    const resumeAtMs = state.value.positionMs
    const wasPlaying = state.value.playing
    // Stopped before anything is fetched, so the file being switched away from
    // does not keep playing through the seconds the other one takes to arrive,
    // and so the position picked up is the one the switch was asked at.
    getEngine().pause()
    // Set before awaiting, so a second call while this one is decoding — the
    // Track page polls every second during a separation — is a no-op rather
    // than a second decode of the same file.
    state.value.backingSource = backingSource
    state.value.playing = false
    state.value.loading = true
    state.value.error = null
    try {
      const durationMs = await getEngine().load(backingUrl(trackId, backingSource), state.value.adjustments, resumeAtMs)
      if (durationMs === null) return
      state.value.durationMs = durationMs
      state.value.positionMs = Math.min(resumeAtMs, durationMs)
      state.value.loading = false
      if (wasPlaying) await play()
    }
    catch (error) {
      if (state.value.track?.id !== trackId) return
      state.value.error = describeError(error)
      state.value.loading = false
    }
  }

  async function play(): Promise<void> {
    if (!state.value.track || state.value.loading || state.value.error) return
    await getEngine().play()
  }

  function pause(): void {
    getEngine().pause()
  }

  function toggle(): Promise<void> | void {
    return state.value.playing ? pause() : play()
  }

  function seek(positionMs: number): void {
    const clamped = Math.max(0, Math.min(positionMs, state.value.durationMs))
    state.value.positionMs = clamped
    getEngine().seek(clamped)
  }

  /** Changes Adjustments live and remembers them on the Track shortly after the last change. */
  function setAdjustments(patch: Partial<Adjustments>): void {
    const next: Adjustments = { ...state.value.adjustments, ...patch }
    state.value.adjustments = next
    getEngine().setAdjustments(next)
    const trackId = state.value.track?.id
    if (trackId) scheduleSave(trackId, next)
  }

  function resetAdjustments(): void {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS })
  }

  /**
   * Sets how loud the Backing Track plays, immediately and with no reload —
   * a gain change, not a pause, so position, the seek bar, and Lyrics
   * scrolling keep advancing normally even at zero. Remembered per-device,
   * never sent to the server (ticket 11).
   */
  function setVolume(volume: number): void {
    state.value.volume = volumeStore.set(volume)
    getEngine().setGain(state.value.volume)
  }

  function scheduleSave(trackId: string, adjustments: Adjustments): void {
    if (pendingSave) clearTimeout(pendingSave.timer)
    const run = () => {
      pendingSave = undefined
      $fetch(`/api/tracks/${trackId}/adjustments`, { method: 'PUT', body: adjustments, keepalive: true })
        .then(() => {
          state.value.saveError = null
        })
        .catch((error) => {
          state.value.saveError = describeError(error)
        })
    }
    pendingSave = { timer: setTimeout(run, SAVE_DEBOUNCE_MS), run }
  }

  function flushSave(): void {
    if (!pendingSave) return
    clearTimeout(pendingSave.timer)
    pendingSave.run()
  }

  /** Whether the player is fetching and decoding this Track's Backing Track right now. */
  function isLoading(trackId: string): boolean {
    return state.value.track?.id === trackId && state.value.loading
  }

  /** The Backing Track's AudioContext, once loading a Track has created it; undefined before then. */
  function getAudioContext(): AudioContext | undefined {
    return engine?.audioContext
  }

  /** Drops the current Track, for instance after it was deleted from the library. */
  function close(): void {
    flushSave()
    if (engine) engine.unload()
    state.value.track = null
    state.value.loading = false
    state.value.error = null
    state.value.playing = false
    state.value.positionMs = 0
    state.value.durationMs = 0
    state.value.backingSource = DEFAULT_BACKING_SOURCE
    state.value.adjustments = { ...DEFAULT_ADJUSTMENTS }
  }

  return {
    state,
    open,
    play,
    pause,
    toggle,
    seek,
    setAdjustments,
    resetAdjustments,
    setVolume,
    isLoading,
    close,
    getAudioContext,
  }
}
