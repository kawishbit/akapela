import { LYRICS_PROVIDER_LABELS, type LyricsKind, type LyricsLine, type LyricsProviderName } from '../../shared/lyrics'
import type { Song, SongGuess } from '../../shared/song'

/**
 * A Lyrics Provider is where Lyrics come from. Everything remote about
 * identifying a Song and reading its words lives behind these two operations,
 * so a provider whose HTML or API shifts under us can be fixed in one file and
 * faked whole in tests.
 */
export interface LyricsProvider {
  readonly name: LyricsProviderName
  /**
   * Whether this instance can be used. A provider that needs a credential the
   * self-hoster has not configured is still here, so the app can say what it
   * would take to have it, but the singer is not offered it.
   */
  readonly available: boolean
  /** Songs the provider knows that match the guess, best first. */
  searchSongs(query: SongSearchQuery): Promise<SongMatch[]>
  /** The Lyrics for a confirmed Song, or null when the provider has none. */
  fetchLyrics(song: Song): Promise<FetchedLyrics | null>
}

export interface SongSearchQuery extends SongGuess {
  /** Duration of the Backing Track, which providers use to rank matches. */
  durationMs?: number | null
}

/** A Song a provider knows about, with the extra detail that helps pick between matches. */
export interface SongMatch extends Song {
  album: string | null
  durationMs: number | null
  /** The provider says this recording has no vocals, so it has no words to offer. */
  instrumental: boolean
}

export interface FetchedLyrics {
  kind: LyricsKind
  lines: LyricsLine[]
}

/** Raised when a provider is reachable but unhappy, so the singer sees why rather than a blank list. */
export class LyricsProviderError extends Error {
  constructor(provider: LyricsProviderName, detail: string) {
    super(`${LYRICS_PROVIDER_LABELS[provider]} could not be reached: ${detail}`)
    this.name = 'LyricsProviderError'
  }
}
