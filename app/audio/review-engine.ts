import { BackingTrackEngine } from './engine'
import type { Take } from '~~/server/db/schema'
import type { Adjustments } from '~~/shared/adjustments'
import type { BackingSource } from '~~/shared/backing-source'

export interface ReviewEngineListener {
  /** A fresh position report, as milliseconds elapsed since the Take's start position. */
  onPosition(vocalElapsedMs: number): void
  /** The Take's clip (its recorded duration) finished playing. */
  onEnded(): void
  onError(message: string): void
}

/**
 * Plays a Take's dry vocal over its Backing Track for the Review screen
 * (ticket 08). The Backing Track runs through the same Rubber Band engine
 * used everywhere else, seeked to the Take's start position, so its Effects
 * (ticket 06) apply here too; the vocal is unprocessed PCM connected straight
 * to the destination, on the same AudioContext (ADR 0006) so both advance on
 * one clock but only the backing ever runs through reverb or the low-pass.
 * Tempo is locked to the Take's own value, so the Backing Track's song
 * position keeps advancing, relative to wall time, at the same rate it did
 * while the Take was sung — the dry vocal, itself untouched, stays in sync by
 * being scheduled from that same relationship rather than needing its own
 * time-stretching.
 */
export class TakeReviewEngine {
  private backing = new BackingTrackEngine({
    onPosition: positionMs => this.onBackingPosition(positionMs),
    onEnded: () => this.stopVocal(),
    onError: message => this.listener.onError(message),
  })

  private vocalBuffer: AudioBuffer | undefined
  private vocalSource: AudioBufferSourceNode | undefined
  private vocalGainNode: GainNode | undefined

  private trackId = ''
  private adjustments: Adjustments | undefined
  private backingSource: BackingSource = 'original'
  private startPositionMs = 0
  private takeDurationMs = 0
  private tempoPercent = 100
  private nudgeMs = 0
  private vocalGain = 1
  private playing = false

  constructor(private readonly listener: ReviewEngineListener) {}

  /** Fetches and decodes the Backing Track and the Take's vocal, ready to play from the Take's start position. */
  async load(
    trackId: string,
    vocalUrl: string,
    take: Pick<Take, 'startPositionMs' | 'durationMs' | 'adjustments' | 'backingSource'>,
  ): Promise<void> {
    this.trackId = trackId
    this.adjustments = take.adjustments
    this.backingSource = take.backingSource
    this.startPositionMs = take.startPositionMs
    this.takeDurationMs = take.durationMs
    this.tempoPercent = take.adjustments.tempoPercent

    await this.backing.load(this.backingUrl(take.backingSource), take.adjustments)
    const context = this.backing.audioContext!
    this.backing.seek(this.startPositionMs)

    const response = await fetch(vocalUrl)
    if (!response.ok) throw new Error(`The Take could not be fetched (${response.status})`)
    this.vocalBuffer = await context.decodeAudioData(await response.arrayBuffer())

    this.vocalGainNode = context.createGain()
    this.vocalGainNode.gain.value = this.vocalGain
    this.vocalGainNode.connect(context.destination)
  }

  private backingUrl(source: BackingSource): string {
    return `/api/tracks/${this.trackId}/backing?source=${source}`
  }

  /** Applies new Adjustments to the Backing Track; only pitch is expected to change (tempo is locked). */
  setAdjustments(adjustments: Adjustments): void {
    this.adjustments = adjustments
    this.backing.setAdjustments(adjustments)
  }

  /**
   * Auditions the other Backing Source for a Mix override (ticket 09): a
   * reload, exactly like switching it on the persistent player, that picks up
   * at the same song position and resumes if it was playing. Never written
   * back to the Take — only what a later render request carries.
   *
   * `backingSource` only updates once the load has actually succeeded, so a
   * failure (Stems deleted mid-session, a network hiccup) leaves the engine
   * naming whichever source it is genuinely still playing, and the caller's
   * rejected promise is what tells `useTakeReview` to undo the optimistic UI
   * selection rather than leave it pointing at audio that never loaded.
   */
  async setBackingSource(source: BackingSource): Promise<void> {
    if (source === this.backingSource || !this.adjustments) return
    const resumeAtMs = this.backing.positionMs
    const wasPlaying = this.playing
    this.backing.pause()
    this.stopVocal()
    this.playing = false
    await this.backing.load(this.backingUrl(source), this.adjustments, resumeAtMs)
    this.backingSource = source
    if (wasPlaying) await this.play()
  }

  setVocalGain(gain: number): void {
    this.vocalGain = gain
    if (this.vocalGainNode) this.vocalGainNode.gain.value = gain
  }

  setBackingGain(gain: number): void {
    this.backing.setGain(gain)
  }

  /** Moves the vocal earlier or later relative to the Backing Track; audible immediately, with no restart of the Backing Track. */
  setNudge(nudgeMs: number): void {
    this.nudgeMs = nudgeMs
    if (this.playing) this.scheduleVocal()
  }

  async play(): Promise<void> {
    if (!this.vocalBuffer) return
    await this.backing.play()
    this.playing = true
    this.scheduleVocal()
  }

  pause(): void {
    this.backing.pause()
    this.stopVocal()
    this.playing = false
  }

  unload(): void {
    this.stopVocal()
    this.backing.unload()
  }

  /**
   * Starts, or restarts, the vocal source so that its own time zero lands on
   * the Backing Track's song position `startPositionMs + nudgeMs` — the same
   * placement a rendered Mix uses (spec §Worker jobs). Recomputed from the
   * Backing Track's current position, so pausing and resuming needs no
   * separate bookkeeping: it is just this same schedule run again.
   */
  private scheduleVocal(): void {
    const context = this.backing.audioContext
    const buffer = this.vocalBuffer
    if (!context || !buffer) return
    this.stopVocal()

    const targetSongMs = this.startPositionMs + this.nudgeMs
    const deltaSongMs = targetSongMs - this.backing.positionMs
    const deltaWallSec = (deltaSongMs / 1000) * (100 / this.tempoPercent)

    const when = deltaWallSec >= 0 ? context.currentTime + deltaWallSec : context.currentTime
    const offset = deltaWallSec >= 0 ? 0 : -deltaWallSec
    if (offset >= buffer.duration) return

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(this.vocalGainNode!)
    source.start(when, offset)
    this.vocalSource = source
  }

  private stopVocal(): void {
    if (!this.vocalSource) return
    try {
      this.vocalSource.stop()
    }
    catch {
      // Already stopped or never started; nothing to undo.
    }
    this.vocalSource.disconnect()
    this.vocalSource = undefined
  }

  private onBackingPosition(positionMs: number): void {
    const vocalElapsedMs = positionMs - this.startPositionMs
    this.listener.onPosition(vocalElapsedMs)
    if (this.playing && vocalElapsedMs >= this.takeDurationMs) {
      this.pause()
      // Rewind so the clip starts from its top again on the next play, rather
      // than resuming past its own end from wherever the Backing Track sits.
      this.backing.seek(this.startPositionMs)
      this.listener.onEnded()
    }
  }
}
