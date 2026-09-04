import rubberBandWasmUrl from 'rubberband-wasm/dist/rubberband.wasm?url'
import { DEFAULT_ADJUSTMENTS, pitchScale, timeRatio, type Adjustments } from '~~/shared/adjustments'
import { songTimeAfter } from './song-time'

/** Served from `public/`; AudioWorklet modules load by URL and cannot be bundled with the app. */
const PROCESSOR_URL = '/audio/rubberband-processor.js'
const PROCESSOR_NAME = 'backing-track-processor'

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

/**
 * The browser side of Backing Track playback (ADR 0003, ADR 0004). Fetches
 * and decodes a Backing Track once, hands the samples to the worklet, and
 * forwards transport and Adjustments to it. Positions come back in song
 * time; between reports they are interpolated at the current tempo.
 */
export class BackingTrackEngine {
  private context: AudioContext | undefined
  private node: AudioWorkletNode | undefined
  private setup: Promise<AudioWorkletNode> | undefined
  private waiting = new Map<string, { resolve: (message: WorkletMessage) => void, reject: (error: Error) => void }>()
  private loadGeneration = 0
  private adjustments: Adjustments = { ...DEFAULT_ADJUSTMENTS }
  private lastReport = { positionMs: 0, atContextTime: 0, playing: false }
  private loaded = false

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

  /** Song position in milliseconds, interpolated from the last report while playing. */
  get positionMs(): number {
    const { positionMs, atContextTime, playing } = this.lastReport
    if (!playing || !this.context) return positionMs
    const wallMs = (this.context.currentTime - atContextTime) * 1000
    return Math.min(songTimeAfter(positionMs, wallMs, this.adjustments.tempoPercent), this.durationMs)
  }

  /**
   * Fetches, decodes, and loads a Backing Track. Resolves with its duration,
   * or with null when another load superseded this one before it finished.
   */
  async load(url: string, adjustments: Adjustments): Promise<number | null> {
    const generation = ++this.loadGeneration
    this.loaded = false
    this.adjustments = { ...adjustments }
    const node = await this.ensureNode()
    const context = this.context!

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Backing Track could not be fetched (${response.status})`)
    const buffer = await context.decodeAudioData(await response.arrayBuffer())
    if (generation !== this.loadGeneration) return null

    // The AudioBuffer's own storage cannot be transferred, so copy each channel and hand the copies over.
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice())
    this.post(node, { type: 'adjust', timeRatio: timeRatio(adjustments), pitchScale: pitchScale(adjustments) })
    await this.request(node, { type: 'load', channels }, 'loaded', channels.map(channel => channel.buffer))
    if (generation !== this.loadGeneration) return null

    this.durationMs = buffer.duration * 1000
    this.lastReport = { positionMs: 0, atContextTime: context.currentTime, playing: false }
    this.loaded = true
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

  seek(positionMs: number): void {
    if (!this.node || !this.context) return
    const frame = Math.round((positionMs / 1000) * this.context.sampleRate)
    this.post(this.node, { type: 'seek', frame })
  }

  /** Applies Adjustments to the running stretcher; playback carries on uninterrupted. */
  setAdjustments(adjustments: Adjustments): void {
    // Re-anchor interpolation so the tempo change applies from now, not from the last report.
    this.lastReport = { ...this.lastReport, positionMs: this.positionMs, atContextTime: this.context?.currentTime ?? 0 }
    this.adjustments = { ...adjustments }
    if (this.node) {
      this.post(this.node, { type: 'adjust', timeRatio: timeRatio(adjustments), pitchScale: pitchScale(adjustments) })
    }
  }

  unload(): void {
    this.loadGeneration++
    this.loaded = false
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
    const [wasm] = await Promise.all([
      fetch(rubberBandWasmUrl).then((response) => {
        if (!response.ok) throw new Error('Rubber Band could not be fetched')
        return response.arrayBuffer()
      }),
      context.audioWorklet.addModule(PROCESSOR_URL),
    ])
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => this.onMessage(event.data)
    node.connect(context.destination)
    await this.request(node, { type: 'init', wasm }, 'ready', [wasm])
    this.node = node
    return node
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
