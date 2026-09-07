import { TakeReviewEngine } from '~/audio/review-engine'
import { DEFAULT_ADJUSTMENTS, effectivePitchSemitones, PITCH_SEMITONES_MAX, PITCH_SEMITONES_MIN, type Adjustments } from '~~/shared/adjustments'
import { GAIN_MAX, GAIN_MIN, LATENCY_NUDGE_MS_MAX, LATENCY_NUDGE_MS_MIN } from '~~/shared/take'
import type { Take } from '~~/server/db/schema'

const NUDGE_STORAGE_KEY = 'akapela:latency-nudge-ms'
const SAVE_DEBOUNCE_MS = 300

export interface TakeReviewState {
  loading: boolean
  playing: boolean
  elapsedMs: number
  latencyNudgeMs: number
  vocalGain: number
  backingGain: number
  pitchSemitones: number
  linked: boolean
  tempoPercent: number
  reverbAmount: number
  lowpassHz: number
  error: string | null
  saveError: string | null
  deleting: boolean
}

/**
 * Drives the Review screen (ticket 08): loads the Take's vocal over its
 * Backing Track through `TakeReviewEngine`, and saves nudge, gains, and
 * pitch back to the Take as they change. Tempo is never sent as changed —
 * it always travels back as the Take's own value (ADR 0003).
 */
export function useTakeReview(trackId: Ref<string>, take: Ref<Take | undefined>) {
  const state = ref<TakeReviewState>({
    loading: true,
    playing: false,
    elapsedMs: 0,
    latencyNudgeMs: 0,
    vocalGain: 1,
    backingGain: 1,
    pitchSemitones: 0,
    linked: false,
    tempoPercent: 100,
    reverbAmount: DEFAULT_ADJUSTMENTS.reverbAmount,
    lowpassHz: DEFAULT_ADJUSTMENTS.lowpassHz,
    error: null,
    saveError: null,
    deleting: false,
  })

  let engine: TakeReviewEngine | undefined
  let loadedTakeId: string | undefined
  let pendingSave: { timer: ReturnType<typeof setTimeout>, run: () => void } | undefined

  watch(take, (value) => {
    if (value && value.id !== loadedTakeId) void load(value)
  }, { immediate: true })

  async function load(current: Take): Promise<void> {
    loadedTakeId = current.id
    state.value.loading = true
    state.value.error = null
    state.value.latencyNudgeMs = initialNudgeMs(current)
    state.value.vocalGain = current.vocalGain
    state.value.backingGain = current.backingGain
    state.value.pitchSemitones = current.adjustments.pitchSemitones
    state.value.linked = current.adjustments.linked
    state.value.tempoPercent = current.adjustments.tempoPercent
    // No control on this screen touches either yet (ticket 06); carried
    // through unchanged so a save here never resets what's stored.
    state.value.reverbAmount = current.adjustments.reverbAmount
    state.value.lowpassHz = current.adjustments.lowpassHz

    engine = new TakeReviewEngine({
      onPosition: (vocalElapsedMs) => {
        state.value.elapsedMs = Math.max(0, Math.min(vocalElapsedMs, current.durationMs))
      },
      onEnded: () => {
        state.value.playing = false
        state.value.elapsedMs = 0
      },
      onError: (message) => {
        state.value.error = message
        state.value.loading = false
        state.value.playing = false
      },
    })
    try {
      await engine.load(
        `/api/tracks/${trackId.value}/backing`,
        `/api/tracks/${trackId.value}/takes/${current.id}/audio`,
        current,
      )
      engine.setVocalGain(state.value.vocalGain)
      engine.setBackingGain(state.value.backingGain)
      engine.setNudge(state.value.latencyNudgeMs)
      state.value.loading = false
      // Queues a save of what is shown, including a per-device nudge default
      // the singer never touched, so "Keep" persists it even without an edit.
      scheduleSave()
    }
    catch (e) {
      state.value.error = describeError(e)
      state.value.loading = false
    }
  }

  async function toggle(): Promise<void> {
    if (!engine || state.value.loading || state.value.error) return
    if (state.value.playing) {
      engine.pause()
      state.value.playing = false
    }
    else {
      await engine.play()
      state.value.playing = true
    }
  }

  /** The nudge slider: audible immediately, with no restart of the Backing Track. */
  function setNudge(nudgeMs: number): void {
    const clamped = Math.max(LATENCY_NUDGE_MS_MIN, Math.min(LATENCY_NUDGE_MS_MAX, Math.round(nudgeMs)))
    state.value.latencyNudgeMs = clamped
    engine?.setNudge(clamped)
    saveRememberedNudgeMs(clamped)
    scheduleSave()
  }

  function setVocalGain(gain: number): void {
    const clamped = Math.max(GAIN_MIN, Math.min(GAIN_MAX, gain))
    state.value.vocalGain = clamped
    engine?.setVocalGain(clamped)
    scheduleSave()
  }

  function setBackingGain(gain: number): void {
    const clamped = Math.max(GAIN_MIN, Math.min(GAIN_MAX, gain))
    state.value.backingGain = clamped
    engine?.setBackingGain(clamped)
    scheduleSave()
  }

  /** Changing pitch does nothing audible while linked — it follows the (locked) tempo instead. */
  function setPitch(semitones: number): void {
    if (state.value.linked) return
    const clamped = Math.max(PITCH_SEMITONES_MIN, Math.min(PITCH_SEMITONES_MAX, Math.round(semitones)))
    state.value.pitchSemitones = clamped
    engine?.setAdjustments(currentAdjustments())
    scheduleSave()
  }

  const heardPitch = computed(() => effectivePitchSemitones(currentAdjustments()))

  function currentAdjustments(): Adjustments {
    return {
      pitchSemitones: state.value.pitchSemitones,
      tempoPercent: state.value.tempoPercent,
      linked: state.value.linked,
      reverbAmount: state.value.reverbAmount,
      lowpassHz: state.value.lowpassHz,
    }
  }

  function scheduleSave(): void {
    if (pendingSave) clearTimeout(pendingSave.timer)
    const run = () => {
      pendingSave = undefined
      const takeId = loadedTakeId
      if (!takeId) return
      $fetch(`/api/tracks/${trackId.value}/takes/${takeId}`, {
        method: 'PUT',
        body: {
          latencyNudgeMs: state.value.latencyNudgeMs,
          vocalGain: state.value.vocalGain,
          backingGain: state.value.backingGain,
          adjustments: currentAdjustments(),
        },
        keepalive: true,
      })
        .then(() => {
          state.value.saveError = null
        })
        .catch((error) => {
          state.value.saveError = describeError(error)
        })
    }
    pendingSave = { timer: setTimeout(run, SAVE_DEBOUNCE_MS), run }
  }

  /** Ensures the latest review settings are saved; call before leaving the screen. */
  function flushSave(): void {
    if (!pendingSave) return
    clearTimeout(pendingSave.timer)
    pendingSave.run()
  }

  /** Deletes the Take and its file after the caller has confirmed. Leaves `state.error` set on failure. */
  async function discard(): Promise<void> {
    const takeId = loadedTakeId
    if (!takeId || state.value.deleting) return
    state.value.deleting = true
    state.value.error = null
    try {
      await $fetch(`/api/tracks/${trackId.value}/takes/${takeId}`, { method: 'DELETE' })
      // Nothing left to save; drop a pending debounce so `destroy` doesn't
      // flush a PUT against a Take that no longer exists.
      if (pendingSave) clearTimeout(pendingSave.timer)
      pendingSave = undefined
      loadedTakeId = undefined
    }
    catch (e) {
      state.value.error = describeError(e)
      state.value.deleting = false
    }
  }

  function destroy(): void {
    flushSave()
    engine?.unload()
    engine = undefined
  }

  return { state, heardPitch, toggle, setNudge, setVocalGain, setBackingGain, setPitch, flushSave, discard, destroy }
}

/** A Take fresh from upload always has nudge 0; that's when the per-device default applies. A Take reopened after a Keep shows what was saved on it. */
function initialNudgeMs(take: Take): number {
  return take.latencyNudgeMs !== 0 ? take.latencyNudgeMs : loadRememberedNudgeMs()
}

function loadRememberedNudgeMs(): number {
  try {
    const stored = localStorage.getItem(NUDGE_STORAGE_KEY)
    const parsed = stored === null ? 0 : Number(stored)
    return Number.isInteger(parsed) ? parsed : 0
  }
  catch {
    return 0
  }
}

function saveRememberedNudgeMs(nudgeMs: number): void {
  try {
    localStorage.setItem(NUDGE_STORAGE_KEY, String(nudgeMs))
  }
  catch {
    // Private browsing or storage disabled; the default just won't stick.
  }
}
