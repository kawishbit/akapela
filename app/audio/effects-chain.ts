import { LOWPASS_HZ_MAX, REVERB_AMOUNT_MIN, type Adjustments } from '~~/shared/adjustments'

/**
 * The Effects — a reverb and a low-pass — as one patchable stretch of Web
 * Audio graph: `input` → convolver dry/wet → biquad → `output`. The worker's
 * ffmpeg render builds the same two filters in the same order (ADR 0003), and
 * from the same impulse response file.
 *
 * One chain per signal that can be coloured: the Backing Track always has one
 * (`BackingTrackEngine`), and the Review screen's dry vocal has its own
 * (`TakeReviewEngine`), so an Effects Target of Vocal, Backing, Both, or None
 * is just which of the two is left active (ticket 13).
 *
 * Both filters are unplugged from the graph entirely at their bypassed values,
 * rather than merely configured to be neutral, so an untouched signal's path
 * is these few unity-gain nodes and nothing more — inaudible, and cheap.
 */
export class EffectsChain {
  /** What the source connects into. */
  readonly input: GainNode
  /** What carries on to whatever follows the Effects. */
  readonly output: GainNode

  /** The reverb's dry and wet legs; both always connected so their gains alone crossfade the effect. */
  private readonly dryGain: GainNode
  private readonly wetGain: GainNode
  /** Where the dry and wet legs recombine, and what the lowpass reads from (or is bypassed around). */
  private readonly reverbSum: GainNode
  private readonly convolver: ConvolverNode
  private readonly lowpass: BiquadFilterNode
  /** Whether each filter is currently patched in; tracked so applying only (dis)connects on a real change. */
  private reverbConnected = false
  private lowpassConnected = false

  constructor(context: AudioContext, impulseResponse: AudioBuffer) {
    this.input = context.createGain()
    this.output = context.createGain()
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()
    this.wetGain.gain.value = 0
    this.reverbSum = context.createGain()
    this.convolver = context.createConvolver()
    // Normalization off on both sides of ADR 0003's contract: the gain compensation a browser's
    // ConvolverNode applies automatically is engine-specific and won't match ffmpeg's afir, so the
    // impulse response file itself is pre-scaled to unity-ish convolution gain instead.
    this.convolver.normalize = false
    this.convolver.buffer = impulseResponse
    this.lowpass = context.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = LOWPASS_HZ_MAX

    this.input.connect(this.dryGain).connect(this.reverbSum)
    this.reverbSum.connect(this.output)
  }

  /**
   * Patches both filters into (or out of) the graph and updates their live
   * parameters. `active` is whether the Effects Target reaches this signal at
   * all; when it does not, the chain is held at the bypassed values whatever
   * the Adjustments say, so passing through it is passing through nothing.
   */
  apply(adjustments: Adjustments, active: boolean): void {
    this.applyReverb(active ? adjustments.reverbAmount : REVERB_AMOUNT_MIN)
    this.applyLowpass(active ? adjustments.lowpassHz : LOWPASS_HZ_MAX)
  }

  private applyReverb(amount: number): void {
    const { input, dryGain, wetGain, convolver, reverbSum } = this
    const enabled = amount > REVERB_AMOUNT_MIN
    if (enabled !== this.reverbConnected) {
      if (enabled) {
        input.connect(convolver)
        convolver.connect(wetGain)
        wetGain.connect(reverbSum)
      }
      else {
        input.disconnect(convolver)
        convolver.disconnect(wetGain)
        wetGain.disconnect(reverbSum)
      }
      this.reverbConnected = enabled
    }
    const wet = amount / 100
    dryGain.gain.value = 1 - wet
    wetGain.gain.value = wet
  }

  private applyLowpass(hz: number): void {
    const { reverbSum, lowpass, output } = this
    const enabled = hz < LOWPASS_HZ_MAX
    if (enabled !== this.lowpassConnected) {
      if (enabled) {
        reverbSum.disconnect(output)
        reverbSum.connect(lowpass)
        lowpass.connect(output)
      }
      else {
        reverbSum.disconnect(lowpass)
        lowpass.disconnect(output)
        reverbSum.connect(output)
      }
      this.lowpassConnected = enabled
    }
    if (enabled) lowpass.frequency.value = hz
  }
}
