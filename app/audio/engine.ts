import rubberBandWasmUrl from 'rubberband-wasm/dist/rubberband.wasm?url'
import {
  DEFAULT_ADJUSTMENTS,
  effectsReachBacking,
  pitchScale,
  timeRatio,
  type Adjustments,
} from '~~/shared/adjustments'
import { EffectsChain } from './effects-chain'
import { songTimeAfter } from './song-time'
import {
  layerGains,
  needsGuideVocal,
  primaryFile,
  trackAudioUrl,
  type BackingSelection,
} from './backing-files'
import type { StemLevels, TrackAudioFile } from '~~/shared/backing-source'

/** Served from `public/`; AudioWorklet modules load by URL and cannot be bundled with the app. */
const PROCESSOR_URL = '/audio/rubberband-processor.js'
const PROCESSOR_NAME = 'backing-track-processor'

/** The one impulse response ADR 0003 requires both engines to share; the worker's ffmpeg render (ticket 07) reads the same file. */
const IMPULSE_RESPONSE_URL = '/audio/large-hall-ir.wav'

/** Every stored audio master is 44.1 kHz (ADR 0005); pinning the context to match avoids resampling the Backing Track on load. */
const SAMPLE_RATE = 44_100

export interface EngineListener {
  /** A fresh position report from the audio thread, in song time. */
  onPosition(positionMs: number, playing: boolean): void
  onEnded(): void
  onError(message: string): void
}

type WorkletMessage
  = | { type: 'ready' }
    | { type: 'loaded', frames: number }
    | { type: 'position', frame: number, playing: boolean }
    | { type: 'ended' }
    | { type: 'error', message: string }

/** Where the worklet's Vocals Stem layer is, for a Backing Source of Stems. */
const GUIDE_VOCAL_LAYER = 1

/**
 * The browser side of Backing Track playback (ADR 0003, ADR 0004). Fetches
 * and decodes a Backing Track once, hands the samples to the worklet, and
 * forwards transport and Adjustments to it. Positions come back in song
 * time; between reports they are interpolated at the current tempo.
 *
 * A Backing Source of Stems is two decoded files, blended by the worklet
 * before its one stretch at the Stem Levels (`backing-files.ts`). Both in
 * memory at once is twice what one Backing Track holds, so the Vocals Stem is
 * only fetched once the Guide Vocal is above zero: the default Stems, and
 * every Track on Original, hold exactly the one buffer they always did.
 */
export class BackingTrackEngine {
  private context: AudioContext | undefined
  private node: AudioWorkletNode | undefined
  private gainNode: GainNode | undefined
  private effects: EffectsChain | undefined
  private impulse: AudioBuffer | undefined
  private setup: Promise<AudioWorkletNode> | undefined
  private waiting = new Map<string, { resolve: (message: WorkletMessage) => void, reject: (error: Error) => void }>()
  private loadGeneration = 0
  private adjustments: Adjustments = { ...DEFAULT_ADJUSTMENTS }
  private lastReport = { positionMs: 0, atContextTime: 0, playing: false }
  private loaded = false
  private trackId = ''
  private selection: BackingSelection | undefined
  /** Whether the Vocals Stem is in the worklet, on its way, or neither. */
  private guideVocal: 'none' | 'loading' | 'loaded' = 'none'

  durationMs = 0

  constructor(private readonly listener: EngineListener) {}

  /**
   * The context Backing Track playback runs on, once loading has created it.
   * A Take recording shares it (rather than opening its own) so the mic
   * capture and the Backing Track advance on the same audio clock.
   */
  get audioContext(): AudioContext | undefined {
    return this.context
  }

  /**
   * The one impulse response ADR 0003 requires both engines to share, once
   * loading has fetched it. Exposed so the Review screen's vocal chain
   * (ticket 13) convolves against the very same buffer rather than fetching
   * and decoding a second copy of the same file.
   */
  get impulseResponse(): AudioBuffer | undefined {
    return this.impulse
  }

  /** Song position in milliseconds, interpolated from the last report while playing. */
  get positionMs(): number {
    const { positionMs, atContextTime, playing } = this.lastReport
    if (!playing || !this.context) return positionMs
    const wallMs = (this.context.currentTime - atContextTime) * 1000
    return Math.min(songTimeAfter(positionMs, wallMs, this.adjustments.tempoPercent), this.durationMs)
  }

  /**
   * Fetches, decodes, and loads a Track's Backing Track from the Backing
   * Source `selection` names. Resolves with its duration, or with null when
   * another load superseded this one before it finished.
   *
   * `startAtMs` is where to leave the transport once it is loaded, which is
   * what makes switching Backing Source mid-song a reload the singer only
   * hears: the other file is fetched and decoded, and playback picks up at the
   * song position it left. Stem Levels are not a reload: see `setStemLevels`.
   */
  async load(trackId: string, selection: BackingSelection, adjustments: Adjustments, startAtMs = 0): Promise<number | null> {
    const generation = ++this.loadGeneration
    this.loaded = false
    this.adjustments = { ...adjustments }
    this.trackId = trackId
    this.selection = { source: selection.source, stemLevels: { ...selection.stemLevels } }
    const withGuideVocal = needsGuideVocal(selection)
    this.guideVocal = withGuideVocal ? 'loading' : 'none'
    const node = await this.ensureNode()

    // The Guide Vocal is heard only once it has loaded: a Vocals Stem that
    // fails leaves the Backing Track playing without it, as the lazy fetch does.
    const [buffer, guideVocal] = await Promise.all([
      this.decode(trackId, primaryFile(selection.source)),
      withGuideVocal ? this.decode(trackId, 'vocals').catch(warnGuideVocal) : null,
    ])
    if (generation !== this.loadGeneration) return null

    const layers = [buffer, ...(guideVocal ? [guideVocal] : [])].map(copyChannels)
    this.post(node, { type: 'adjust', timeRatio: timeRatio(adjustments), pitchScale: pitchScale(adjustments) })
    this.applyEffects(adjustments)
    await this.request(
      node,
      { type: 'load', layers, gains: layerGains(this.selection) },
      'loaded',
      layers.flat().map(channel => channel.buffer),
    )
    if (generation !== this.loadGeneration) return null
    this.guideVocal = guideVocal ? 'loaded' : 'none'
    const context = this.context!

    this.durationMs = buffer.duration * 1000
    const startMs = Math.max(0, Math.min(startAtMs, this.durationMs))
    this.lastReport = { positionMs: startMs, atContextTime: context.currentTime, playing: false }
    this.loaded = true
    if (startMs > 0) this.seek(startMs)
    // The Guide Vocal was raised from zero while this load was under way.
    if (needsGuideVocal(this.selection) && this.guideVocal === 'none') void this.loadGuideVocal()
    return this.durationMs
  }

  async play(): Promise<void> {
    if (!this.node || !this.context || !this.loaded) return
    // Browsers keep the context suspended until a user gesture; play is always one.
    if (this.context.state !== 'running') await this.context.resume()
    this.post(this.node, { type: 'play' })
  }

  pause(): void {
    if (this.node) this.post(this.node, { type: 'pause' })
  }

  /**
   * Moves the transport to a song position, clamped to the Backing Track's own
   * length. The worklet reports back from a seek, but not before this call
   * returns, so the interpolation anchor moves here too: `positionMs` answers
   * with the target straight away rather than with wherever the last report
   * left it. That is what lets a caller schedule against the new position in
   * the same turn, which is how the Review screen keeps the vocal in step
   * across a seek (ticket 15).
   */
  seek(positionMs: number): void {
    if (!this.node || !this.context) return
    const clamped = Math.max(0, Math.min(positionMs, this.durationMs))
    const frame = Math.round((clamped / 1000) * this.context.sampleRate)
    this.lastReport = { ...this.lastReport, positionMs: clamped, atContextTime: this.context.currentTime }
    this.post(this.node, { type: 'seek', frame })
  }

  /** Applies Adjustments to the running stretcher; playback carries on uninterrupted. */
  setAdjustments(adjustments: Adjustments): void {
    // Re-anchor interpolation so the tempo change applies from now, not from the last report.
    this.lastReport = { ...this.lastReport, positionMs: this.positionMs, atContextTime: this.context?.currentTime ?? 0 }
    this.adjustments = { ...adjustments }
    if (this.node) {
      this.post(this.node, { type: 'adjust', timeRatio: timeRatio(adjustments), pitchScale: pitchScale(adjustments) })
      this.applyEffects(adjustments)
    }
  }

  /**
   * Changes how loud each Stem is in a Backing Track taken from Stems, live:
   * no reload, pause, or seek, heard once the stretcher's short buffer has
   * played out. Raising the Guide Vocal from zero for the first time fetches
   * the Vocals Stem in the background, and it fades in once it arrives; until
   * then playback carries on without it. On Original the levels are only
   * remembered, for the next load that is Stems.
   */
  setStemLevels(levels: StemLevels): void {
    if (!this.selection) return
    this.selection = { ...this.selection, stemLevels: { ...levels } }
    if (this.selection.source !== 'stems' || !this.node) return
    this.post(this.node, { type: 'gains', gains: layerGains(this.selection) })
    // Mid-load, the load itself fetches it once it is done.
    if (this.loaded && needsGuideVocal(this.selection) && this.guideVocal === 'none') void this.loadGuideVocal()
  }

  /** Fetches the Vocals Stem into a Backing Track already playing from Stems, unless a load has replaced it since. */
  private async loadGuideVocal(): Promise<void> {
    const generation = this.loadGeneration
    this.guideVocal = 'loading'
    try {
      const buffer = await this.decode(this.trackId, 'vocals')
      if (generation !== this.loadGeneration || !this.node) return
      const channels = copyChannels(buffer)
      this.post(this.node, { type: 'layer', index: GUIDE_VOCAL_LAYER, channels }, channels.map(channel => channel.buffer))
      this.guideVocal = 'loaded'
    }
    catch (error) {
      if (generation !== this.loadGeneration) return
      // Playback carries on over the Instrumental Stem alone; the next time a
      // level moves, the fetch is tried again.
      this.guideVocal = 'none'
      warnGuideVocal(error)
    }
  }

  private async decode(trackId: string, file: TrackAudioFile): Promise<AudioBuffer> {
    const response = await fetch(trackAudioUrl(trackId, file))
    if (!response.ok) throw new Error(`Backing Track could not be fetched (${response.status})`)
    return this.context!.decodeAudioData(await response.arrayBuffer())
  }

  /** Sets a linear gain stage on the Backing Track's output; 1 is unity. Used by the Review screen's backing gain (ticket 08). */
  setGain(gain: number): void {
    if (this.gainNode) this.gainNode.gain.value = gain
  }

  unload(): void {
    this.loadGeneration++
    this.loaded = false
    this.selection = undefined
    this.guideVocal = 'none'
    this.durationMs = 0
    this.lastReport = { positionMs: 0, atContextTime: 0, playing: false }
    if (this.node) this.post(this.node, { type: 'unload' })
  }

  private ensureNode(): Promise<AudioWorkletNode> {
    if (!this.setup) {
      this.setup = this.createNode().catch((error) => {
        this.setup = undefined
        throw error
      })
    }
    return this.setup
  }

  private async createNode(): Promise<AudioWorkletNode> {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.context = context
    const [wasm, impulseResponse] = await Promise.all([
      fetch(rubberBandWasmUrl).then((response) => {
        if (!response.ok) throw new Error('Rubber Band could not be fetched')
        return response.arrayBuffer()
      }),
      fetch(IMPULSE_RESPONSE_URL).then((response) => {
        if (!response.ok) throw new Error('The reverb impulse response could not be fetched')
        return response.arrayBuffer()
      }).then(data => context.decodeAudioData(data)),
      context.audioWorklet.addModule(PROCESSOR_URL),
    ])
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => this.onMessage(event.data)

    // worklet → Effects (convolver dry/wet, then biquad lowpass) → output
    // gain. The worker's ffmpeg render (ticket 07) must build the same chain
    // in the same order (ADR 0003); `EffectsChain` is that stretch of graph,
    // and the Review screen's vocal has one of its own.
    const gainNode = context.createGain()
    const effects = new EffectsChain(context, impulseResponse)

    node.connect(effects.input)
    effects.output.connect(gainNode)
    gainNode.connect(context.destination)

    await this.request(node, { type: 'init', wasm }, 'ready', [wasm])
    this.node = node
    this.gainNode = gainNode
    this.effects = effects
    this.impulse = impulseResponse
    return node
  }

  /** Colours the Backing Track only when the Effects Target reaches it; otherwise its chain stays bypassed (ticket 13). */
  private applyEffects(adjustments: Adjustments): void {
    this.effects?.apply(adjustments, effectsReachBacking(adjustments.effectsTarget))
  }

  private onMessage(message: WorkletMessage): void {
    const waiter = this.waiting.get(message.type)
    if (waiter) {
      this.waiting.delete(message.type)
      waiter.resolve(message)
      return
    }
    switch (message.type) {
      case 'position': {
        const positionMs = (message.frame / this.context!.sampleRate) * 1000
        this.lastReport = { positionMs, atContextTime: this.context!.currentTime, playing: message.playing }
        this.listener.onPosition(positionMs, message.playing)
        break
      }
      case 'ended':
        this.listener.onEnded()
        break
      case 'error':
        for (const waiter of this.waiting.values()) waiter.reject(new Error(message.message))
        this.waiting.clear()
        this.listener.onError(message.message)
        break
    }
  }

  private post(node: AudioWorkletNode, message: object, transfer: Transferable[] = []): void {
    node.port.postMessage(message, transfer)
  }

  /** Sends a message and resolves with the worklet's reply of type `reply`. */
  private request(node: AudioWorkletNode, message: object, reply: WorkletMessage['type'], transfer: Transferable[] = []) {
    return new Promise<WorkletMessage>((resolve, reject) => {
      this.waiting.set(reply, { resolve, reject })
      this.post(node, message, transfer)
    })
  }
}

function warnGuideVocal(error: unknown): null {
  console.warn('The Guide Vocal could not be loaded:', error instanceof Error ? error.message : error)
  return null
}

/** The AudioBuffer's own storage cannot be transferred, so each channel is copied and the copies handed over. */
function copyChannels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice())
}
