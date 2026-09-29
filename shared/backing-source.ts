/**
 * Backing Source: which of a Track's audio files its Backing Track is taken
 * from. `original` is the audio the import produced and is never overwritten,
 * so switching back to it is instant and lossless; `stems` is the two Stems a
 * separation wrote, blended at the Stem Levels, which only exist once one has
 * run.
 *
 * Shared because both halves read the same words: the Track remembers one and
 * the switch on Track detail sets it, while the stream route takes one as a
 * query override and the browser engine names one on every fetch.
 */

export const BACKING_SOURCES = ['original', 'stems'] as const
export type BackingSource = (typeof BACKING_SOURCES)[number]

/**
 * What a Track sings over until a separation succeeds and flips it. Every Track
 * has original audio; only a separated one has anything else.
 */
export const DEFAULT_BACKING_SOURCE: BackingSource = 'original'

/**
 * The Backing Source's name before Stem Levels, when the only thing a Stem
 * could be was the Instrumental Stem at full level. It is exactly `stems` at
 * the default Stem Levels, so it is read as that wherever it still turns up:
 * an older client's request, an older Desktop App's query.
 */
const LEGACY_INSTRUMENTAL = 'instrumental'

export const INVALID_BACKING_SOURCE_MESSAGE
  = `A Backing Source is either ${BACKING_SOURCES.join(' or ')}.`

/**
 * Why `stems` is refused on a Track nobody has separated. Said in terms of
 * what to do about it, because the singer reaches this by tapping a switch
 * that was offered to them.
 */
export const NO_STEMS_MESSAGE
  = 'This Track has no Stems to sing over. Separate it first.'

/** Turns untrusted input into a Backing Source, or throws with `INVALID_BACKING_SOURCE_MESSAGE`. */
export function parseBackingSource(input: unknown): BackingSource {
  if (input === LEGACY_INSTRUMENTAL) return 'stems'
  if (!BACKING_SOURCES.includes(input as BackingSource)) throw new Error(INVALID_BACKING_SOURCE_MESSAGE)
  return input as BackingSource
}

/**
 * The two Stems a separation writes, by the name the stream route and the
 * render call each one. The Vocals Stem is heard as the Guide Vocal.
 */
export const STEMS = ['instrumental', 'vocals'] as const
export type Stem = (typeof STEMS)[number]

export const INVALID_STEM_MESSAGE = `A Stem is either ${STEMS.join(' or ')}.`

export function parseStem(input: unknown): Stem {
  if (!STEMS.includes(input as Stem)) throw new Error(INVALID_STEM_MESSAGE)
  return input as Stem
}

/** One of a Track's stored audio files: its original audio, or one Stem. */
export type TrackAudioFile = 'original' | Stem

/**
 * Stem Levels: how loud each Stem is in a Backing Track taken from Stems, as
 * a linear gain from 0 (silent) to 1 (as separated). Never above 1: a louder
 * Guide Vocal comes from lowering the Instrumental, since boosting a Stem
 * boosts its separation artefacts with it.
 */
export interface StemLevels {
  guideVocal: number
  instrumental: number
}

export const STEM_LEVEL_MIN = 0
export const STEM_LEVEL_MAX = 1

/** No Guide Vocal, the whole Instrumental: what `stems` sounded like before there were levels. */
export const DEFAULT_STEM_LEVELS: StemLevels = Object.freeze({ guideVocal: 0, instrumental: 1 })

export const INVALID_STEM_LEVELS_MESSAGE
  = `Stem Levels need a Guide Vocal and an Instrumental level, each from ${STEM_LEVEL_MIN} to ${STEM_LEVEL_MAX}.`

/** Turns untrusted input into Stem Levels, or throws with `INVALID_STEM_LEVELS_MESSAGE`. */
export function parseStemLevels(input: unknown): StemLevels {
  if (!input || typeof input !== 'object') throw new Error(INVALID_STEM_LEVELS_MESSAGE)
  const { guideVocal, instrumental } = input as Record<string, unknown>
  if (!isLevel(guideVocal) || !isLevel(instrumental)) throw new Error(INVALID_STEM_LEVELS_MESSAGE)
  return { guideVocal, instrumental }
}

/**
 * Stem Levels from a request that may predate them, which meant the default
 * ones; anything that is there is held to the range.
 */
export function parseOptionalStemLevels(input: unknown): StemLevels {
  return input === undefined ? { ...DEFAULT_STEM_LEVELS } : parseStemLevels(input)
}

/** Whether two sets of Stem Levels are the same, so an unchanged slider saves nothing. */
export function sameStemLevels(a: StemLevels, b: StemLevels): boolean {
  return a.guideVocal === b.guideVocal && a.instrumental === b.instrumental
}

function isLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= STEM_LEVEL_MIN && value <= STEM_LEVEL_MAX
}
