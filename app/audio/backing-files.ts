import type { BackingSource, StemLevels, TrackAudioFile } from '~~/shared/backing-source'

/**
 * Which of a Track's stored audio files make up its Backing Track, and how
 * loud each one is: the rule the browser engine loads and blends by, kept
 * apart from it so it can be tested without an AudioContext.
 *
 * Original is one file at unity. Stems are two layers, in the order the
 * worklet blends them: the Instrumental Stem, then the Vocals Stem, heard as
 * the Guide Vocal.
 */

/** What the engine plays: a Backing Source, and the Stem Levels that shape it when it is Stems. */
export interface BackingSelection {
  source: BackingSource
  stemLevels: StemLevels
}

/** The stream URL of one of a Track's stored audio files, by name rather than by whatever the Track is on. */
export function trackAudioUrl(trackId: string, file: TrackAudioFile): string {
  return file === 'original'
    ? `/api/tracks/${trackId}/backing?source=original`
    : `/api/tracks/${trackId}/backing?stem=${file}`
}

/** The file every load fetches first, and whose length is the Backing Track's. */
export function primaryFile(source: BackingSource): TrackAudioFile {
  return source === 'original' ? 'original' : 'instrumental'
}

/**
 * Whether the Vocals Stem has to be fetched. Only when it will be heard: at a
 * Guide Vocal of zero it never is, so the default Stems cost exactly what the
 * Instrumental Stem alone always did — one download, one decoded buffer.
 */
export function needsGuideVocal(selection: BackingSelection): boolean {
  return selection.source === 'stems' && selection.stemLevels.guideVocal > 0
}

/** Each layer's gain, in the worklet's layer order. */
export function layerGains(selection: BackingSelection): number[] {
  if (selection.source === 'original') return [1]
  return [selection.stemLevels.instrumental, selection.stemLevels.guideVocal]
}
