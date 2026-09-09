import { TakeReviewEngine } from '~/audio/review-engine'
import {
  DEFAULT_ADJUSTMENTS,
  effectivePitchSemitones,
  type EffectsTarget,
  LOWPASS_HZ_MAX,
  LOWPASS_HZ_MIN,
  PITCH_SEMITONES_MAX,
  PITCH_SEMITONES_MIN,
  REVERB_AMOUNT_MAX,
  REVERB_AMOUNT_MIN,
  type Adjustments,
} from '~~/shared/adjustments'
import { DEFAULT_BACKING_SOURCE, type BackingSource } from '~~/shared/backing-source'
import { GAIN_MAX, GAIN_MIN, LATENCY_NUDGE_MS_MAX, LATENCY_NUDGE_MS_MIN } from '~~/shared/take'
import type { Take } from '~~/server/db/schema'

const NUDGE_STORAGE_KEY = 'akapela:latency-nudge-ms'
const SAVE_DEBOUNCE_MS = 300

export interface TakeReviewState {
  loading: boolean
  playing: boolean
  elapsedMs: number
  /** The Backing Track's whole length, which the Review screen shows the Take's clip against (ticket 15). */
  backingDurationMs: number
  latencyNudgeMs: number
  vocalGain: number
  backingGain: number
  pitchSemitones: number
  linked: boolean
  tempoPercent: number
  reverbAmount: number
  lowpassHz: number
  /** Which side the Effects colour; one choice for reverb and low-pass together (ticket 13). */
  effectsTarget: EffectsTarget
  /** A Mix-time override of the Take's own (ADR 0003 amendment); never saved back onto it. */
  backingSource: BackingSource
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
    backingDurationMs: 0,
    latencyNudgeMs: 0,
    vocalGain: 1,
    backingGain: 1,
    pitchSemitones: 0,
    linked: false,
    tempoPercent: 100,
    reverbAmount: DEFAULT_ADJUSTMENTS.reverbAmount,
    lowpassHz: DEFAULT_ADJUSTMENTS.lowpassHz,
    effectsTarget: DEFAULT_ADJUSTMENTS.effectsTarget,
    backingSource: DEFAULT_BACKING_SOURCE,
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
    state.value.reverbAmount = current.adjustments.reverbAmount
    state.value.lowpassHz = current.adjustments.lowpassHz
    state.value.effectsTarget = current.adjustments.effectsTarget
    state.value.backingSource = current.backingSource

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
        trackId.value,
        `/api/tracks/${trackId.value}/takes/${current.id}/audio`,
        current,
      )
      engine.setVocalGain(state.value.vocalGain)
      engine.setBackingGain(state.value.backingGain)
      engine.setNudge(state.value.latencyNudgeMs)
      state.value.backingDurationMs = engine.backingDurationMs
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

  /**
   * Moves playback within the Take's clip (ticket 15). `elapsedMs` is written
   * here from what the engine actually applied, rather than left to the next
   * position report, so a lane the singer has just let go of stays where they
   * put it instead of flicking back for the frame before the report lands.
   */
  function seek(vocalElapsedMs: number): void {
    if (!engine || state.value.loading || state.value.error) return
    state.value.elapsedMs = engine.seek(vocalElapsedMs)
  }

  /**
   * The typed nudge (ticket 12): audible immediately, with no restart of the
   * Backing Track. Returns the whole number of milliseconds actually applied,
   * which is what lets the Review screen say so when a typed figure was
   * rounded or clamped rather than taken as written.
   */
  function setNudge(nudgeMs: number): number {
    const clamped = Math.max(LATENCY_NUDGE_MS_MIN, Math.min(LATENCY_NUDGE_MS_MAX, Math.round(nudgeMs)))
    state.value.latencyNudgeMs = clamped
    engine?.setNudge(clamped)
    saveRememberedNudgeMs(clamped)
    scheduleSave()
    return clamped
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

  /** Reverb and low-pass are Mix-time parameters exactly like pitch: audible immediately, saved back on the Take. */
  function setReverbAmount(amount: number): void {
    const clamped = Math.max(REVERB_AMOUNT_MIN, Math.min(REVERB_AMOUNT_MAX, Math.round(amount)))
    state.value.reverbAmount = clamped
    engine?.setAdjustments(currentAdjustments())
    scheduleSave()
  }

  function setLowpassHz(hz: number): void {
    const clamped = Math.max(LOWPASS_HZ_MIN, Math.min(LOWPASS_HZ_MAX, Math.round(hz)))
    state.value.lowpassHz = clamped
    engine?.setAdjustments(currentAdjustments())
    scheduleSave()
  }

  /**
   * Which side the Effects colour (ticket 13). One choice governs reverb and
   * low-pass together, and it moves them between the Backing Track's chain and
   * the vocal's without either being reloaded — `setAdjustments` reaches both.
   */
  function setEffectsTarget(target: EffectsTarget): void {
    state.value.effectsTarget = target
    engine?.setAdjustments(currentAdjustments())
    scheduleSave()
  }

  /**
   * Overrides the Backing Source for the Mix a render will request — a
   * Mix-time parameter, not saved onto the Take, which keeps meaning what it
   * was sung to (ADR 0003 amendment). Auditions the choice immediately.
   */
  function setBackingSource(source: BackingSource): void {
    const previous = state.value.backingSource
    state.value.backingSource = source
    engine?.setBackingSource(source).then(() => {
      state.value.backingDurationMs = engine?.backingDurationMs ?? state.value.backingDurationMs
    }).catch((e) => {
      // The reload failed (Stems deleted mid-session, a network hiccup): the
      // engine is still playing `previous`, so the selection shown has to
      // say so too, with the failure surfaced the way a failed initial load already is.
      state.value.backingSource = previous
      state.value.error = describeError(e)
    })
  }

  const heardPitch = computed(() => effectivePitchSemitones(currentAdjustments()))

  function currentAdjustments(): Adjustments {
    return {
      pitchSemitones: state.value.pitchSemitones,
      tempoPercent: state.value.tempoPercent,
      linked: state.value.linked,
      reverbAmount: state.value.reverbAmount,
      lowpassHz: state.value.lowpassHz,
      effectsTarget: state.value.effectsTarget,
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

  return {
    state,
    heardPitch,
    toggle,
    seek,
    setNudge,
    setVocalGain,
    setBackingGain,
    setPitch,
    setReverbAmount,
    setLowpassHz,
    setEffectsTarget,
    setBackingSource,
    flushSave,
    discard,
    destroy,
  }
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
