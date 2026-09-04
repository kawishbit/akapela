import type { PcmAudio } from './wav'

/** Served from `public/`; AudioWorklet modules load by URL and cannot be bundled with the app. */
const PROCESSOR_URL = '/audio/mic-processor.js'
const PROCESSOR_NAME = 'mic-capture-processor'

export interface RecorderListener {
  /** A fresh level reading from the audio thread, both 0 to 1. */
  onLevel(rms: number, peak: number): void
  onError(message: string): void
}

type WorkletMessage
  = | { type: 'chunk', samples: Float32Array, rms: number, peak: number }
    | { type: 'stopped' }

// One module per AudioContext; the Sing page shares the Backing Track's
// context across Takes, and addModule on an already-loaded context throws.
const loadedContexts = new WeakSet<AudioContext>()

/**
 * Captures a Take as raw PCM through an AudioWorklet (ADR 0006). Runs on the
 * same AudioContext as the Backing Track engine, so recording and playback
 * advance on one audio clock rather than two that can drift apart.
 */
export class TakeRecorder {
  private node: AudioWorkletNode | undefined
  private source: MediaStreamAudioSourceNode | undefined
  private silence: GainNode | undefined
  private chunks: Float32Array[] = []
  private sampleRate = 0
  private stopping: { resolve: (audio: PcmAudio) => void } | undefined

  constructor(private readonly listener: RecorderListener) {}

  /** Begins capturing `stream` on `context`. Call `stop` to end this Take. */
  async start(context: AudioContext, stream: MediaStream): Promise<void> {
    if (!loadedContexts.has(context)) {
      await context.audioWorklet.addModule(PROCESSOR_URL)
      loadedContexts.add(context)
    }

    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      outputChannelCount: [1],
    })
    node.port.onmessage = (event: MessageEvent<WorkletMessage>) => this.onMessage(event.data)
    node.onprocessorerror = () => this.listener.onError('The microphone capture stopped unexpectedly.')

    const source = context.createMediaStreamSource(stream)
    // The worklet's output is never meant to be heard; a muted gain still
    // keeps it pulled into the render graph every quantum (Monitoring, if on,
    // is wired separately with no processing in between).
    const silence = context.createGain()
    silence.gain.value = 0
    source.connect(node).connect(silence).connect(context.destination)

    this.node = node
    this.source = source
    this.silence = silence
    this.chunks = []
    this.sampleRate = context.sampleRate
    node.port.postMessage({ type: 'start' })
  }

  /** Ends capture and resolves with every frame recorded since `start`. */
  stop(): Promise<PcmAudio> {
    return new Promise((resolve) => {
      if (!this.node) {
        resolve({ channels: [new Float32Array(0), new Float32Array(0)], sampleRate: this.sampleRate })
        return
      }
      this.stopping = { resolve }
      this.node.port.postMessage({ type: 'stop' })
    })
  }

  private onMessage(message: WorkletMessage): void {
    switch (message.type) {
      case 'chunk':
        this.chunks.push(message.samples)
        this.listener.onLevel(message.rms, message.peak)
        break
      case 'stopped': {
        const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        const channel = new Float32Array(total)
        let offset = 0
        for (const chunk of this.chunks) {
          channel.set(chunk, offset)
          offset += chunk.length
        }
        const sampleRate = this.sampleRate
        this.teardown()
        // A mic is one channel, but every stored WAV is stereo (ADR 0005); the
        // same samples go to both, same as the Backing Track engine playing a
        // mono Backing Track out of two speakers.
        this.stopping?.resolve({ channels: [channel, channel], sampleRate })
        this.stopping = undefined
        break
      }
    }
  }

  private teardown(): void {
    this.source?.disconnect()
    this.node?.disconnect()
    this.silence?.disconnect()
    this.source = undefined
    this.node = undefined
    this.silence = undefined
    this.chunks = []
  }
}
