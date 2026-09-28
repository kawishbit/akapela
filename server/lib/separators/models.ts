/**
 * The Separation Models a singer can choose from (ADR 0008 amendment): only
 * MDX-Net, since every other family needs a pipeline of its own.
 *
 * No value below is guessed. Each entry was checked the way
 * ADR 0008 asks, against the file that downloads from its
 * URL (2026-09-28):
 *
 * - `partialMd5` is the MD5 of the file's last 10,000 KiB — the key
 *   `audio-separator` and UVR look a model up by (`calculate-model-hashes.py`'s
 *   scheme) — and the download is refused unless it matches.
 * - `nFft`, `compensate`, and `primaryStem` are that key's entry in UVR's
 *   `mdx_model_data/model_data_new.json` registry (`mdx_n_fft_scale_set`,
 *   `compensate`, `primary_stem`).
 * - `dimF` and `segmentSize` are the model's own ONNX input shape, read off
 *   the graph (`[batch, 4, dimF, segmentSize]`), which agrees with the
 *   registry's `mdx_dim_f_set` in every case.
 * - `hopLength` and `overlap` are `Separator`'s library-wide MDX defaults
 *   (`separator.py`'s `mdx_params`), not per-model entries in that registry.
 *
 * The frequency cutoff each description gives is `dimF × 44100 / nFft`: the
 * model never sees the spectrum above it, so what is up there lands in the
 * secondary Stem's subtraction instead of being separated.
 *
 * Imports nothing, so `separate-cli.ts` can load it under plain Node, and the
 * compose image, which copies only this directory, carries it.
 */

export const SEPARATION_MODEL_NAMES = ['Inst_Main', 'Inst_HQ_3', 'Inst_HQ_4', 'Kim_Vocal_2'] as const
export type SeparationModelName = (typeof SEPARATION_MODEL_NAMES)[number]

/** What a Separation is asked for with when nobody chose otherwise, and what made every Stem before there was a choice. */
export const DEFAULT_SEPARATION_MODEL: SeparationModelName = 'Inst_Main'

/** Which Stem the model's own output is. The other is the mix minus it (`mdx-net.ts`). */
export type PrimaryStem = 'instrumental' | 'vocals'

export interface MdxNetConfig {
  nFft: number
  hopLength: number
  dimF: number
  segmentSize: number
  overlap: number
  /** Only used computing the secondary Stem — a scalar correction on the primary, subtracted from the mix. */
  compensate: number
  primaryStem: PrimaryStem
}

export interface SeparationModel {
  name: SeparationModelName
  /** One line for Settings: how fast, how clean, and where it stops listening. */
  description: string
  fileName: string
  partialMd5: string
  config: MdxNetConfig
}

const MDX_DEFAULTS = { hopLength: 1024, segmentSize: 256, overlap: 0.25 } as const

const MODEL_REPO = 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models'

export const SEPARATION_MODELS: Record<SeparationModelName, SeparationModel> = {
  Inst_Main: {
    name: 'Inst_Main',
    description: 'Fastest. Clean enough for most songs; stops at 17.6 kHz.',
    fileName: 'UVR-MDX-NET-Inst_Main.onnx',
    partialMd5: '1c56ec0224f1d559c42fd6fd2a67b154',
    config: { ...MDX_DEFAULTS, nFft: 5120, dimF: 2048, compensate: 1.025, primaryStem: 'instrumental' },
  },
  Inst_HQ_3: {
    name: 'Inst_HQ_3',
    description: 'About 1.5× slower. Cleaner instrumentals across the full range.',
    fileName: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    partialMd5: '55657dd70583b0fedfba5f67df11d711',
    config: { ...MDX_DEFAULTS, nFft: 6144, dimF: 3072, compensate: 1.022, primaryStem: 'instrumental' },
  },
  Inst_HQ_4: {
    name: 'Inst_HQ_4',
    description: 'About 1.2× slower. The newest instrumental model, full range.',
    fileName: 'UVR-MDX-NET-Inst_HQ_4.onnx',
    partialMd5: '0f2a6bc5b49d87d64728ee40e23bceb1',
    config: { ...MDX_DEFAULTS, nFft: 5120, dimF: 2560, compensate: 1.019, primaryStem: 'instrumental' },
  },
  Kim_Vocal_2: {
    name: 'Kim_Vocal_2',
    description: 'About 1.5× slower. Listens for the voice, so less of it is left behind; stops at 17.6 kHz.',
    fileName: 'Kim_Vocal_2.onnx',
    partialMd5: '970b3f9492014d18fefeedfe4773cb42',
    config: { ...MDX_DEFAULTS, nFft: 7680, dimF: 3072, compensate: 1.009, primaryStem: 'vocals' },
  },
}

export function modelUrl(model: SeparationModel): string {
  return `${MODEL_REPO}/${model.fileName}`
}

export function isSeparationModelName(value: unknown): value is SeparationModelName {
  return typeof value === 'string' && (SEPARATION_MODEL_NAMES as readonly string[]).includes(value)
}

export const INVALID_SEPARATION_MODEL_MESSAGE = `A Separation Model is one of ${SEPARATION_MODEL_NAMES.join(', ')}.`

/** How many bytes from the end of a model file its `partialMd5` covers. */
export const PARTIAL_MD5_BYTES = 10_000 * 1024
