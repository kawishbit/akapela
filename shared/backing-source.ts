/**
 * Backing Source: which of a Track's audio files its Backing Track is taken
 * from. `original` is the audio the import produced and is never overwritten,
 * so switching back to it is instant and lossless; `instrumental` is the
 * Instrumental Stem a separation wrote, which only exists once one has run.
 *
 * Shared because both halves read the same two words: the Track remembers one
 * and the switch on Track detail sets it, while the stream route takes one as a
 * query override and the browser engine names one on every fetch.
 */

export const BACKING_SOURCES = ['original', 'instrumental'] as const
export type BackingSource = (typeof BACKING_SOURCES)[number]

/**
 * What a Track sings over until a separation succeeds and flips it. Every Track
 * has original audio; only a separated one has anything else.
 */
export const DEFAULT_BACKING_SOURCE: BackingSource = 'original'

/**
 * What the switch on Track detail and the Sing screen's readout call each one.
 * One word each, because both places are already sharing their room — the
 * readout with pitch and tempo, the switch with the Stems heading.
 */
export const BACKING_SOURCE_LABELS: Record<BackingSource, string> = {
  original: 'Original',
  instrumental: 'Instrumental',
}

export const INVALID_BACKING_SOURCE_MESSAGE
  = `A Backing Source is either ${BACKING_SOURCES.join(' or ')}.`

/**
 * Why `instrumental` is refused on a Track nobody has separated. Said in terms
 * of what to do about it, because the singer reaches this by tapping a switch
 * that was offered to them.
 */
export const NO_STEMS_MESSAGE
  = 'This Track has no Instrumental Stem to sing over. Separate it first.'

/** Turns untrusted input into a Backing Source, or throws with `INVALID_BACKING_SOURCE_MESSAGE`. */
export function parseBackingSource(input: unknown): BackingSource {
  if (!BACKING_SOURCES.includes(input as BackingSource)) throw new Error(INVALID_BACKING_SOURCE_MESSAGE)
  return input as BackingSource
}
