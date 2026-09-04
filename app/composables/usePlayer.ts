import { BackingTrackEngine } from '~/audio/engine'
import type { TrackWithJob } from '~~/server/lib/tracks'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '~~/shared/adjustments'

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
  /** Fetching and decoding the Backing Track. */
  loading: boolean
  error: string | null
  playing: boolean
  positionMs: number
  durationMs: number
  adjustments: Adjustments
  /** The last failure to remember Adjustments on the Track; playback carries on regardless. */
  saveError: string | null
}

const SAVE_DEBOUNCE_MS = 300

// One engine, one animation loop, and one pending save per browser window.
let engine: BackingTrackEngine | undefined
let frameLoop: number | undefined
let pendingSave: { timer: ReturnType<typeof setTimeout>, run: () => void } | undefined

/**
 * The persistent player: one Track loaded at a time, played through the
 * Backing Track engine, with the Adjustments in force remembered on the Track.
 */
export function usePlayer() {
  const state = useState<PlayerState>('player', () => ({
    track: null,
    loading: false,
    error: null,
    playing: false,
    positionMs: 0,
    durationMs: 0,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    saveError: null,
  }))

  function getEngine(): BackingTrackEngine {
    if (!engine) {
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
      return
    }
    flushSave()
    state.value.track = display
    state.value.adjustments = { ...track.adjustments }
    state.value.positionMs = 0
    state.value.durationMs = track.durationMs ?? 0
    state.value.playing = false
    state.value.loading = true
    state.value.error = null
    state.value.saveError = null
    try {
      const durationMs = await getEngine().load(`/api/tracks/${track.id}/backing`, track.adjustments)
      if (durationMs === null) return
      state.value.durationMs = durationMs
      state.value.loading = false
    }
    catch (error) {
      if (state.value.track?.id !== track.id) return
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
    state.value.adjustments = { ...DEFAULT_ADJUSTMENTS }
  }

  return { state, open, play, pause, toggle, seek, setAdjustments, resetAdjustments, close }
}
