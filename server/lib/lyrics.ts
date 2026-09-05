import { eq } from 'drizzle-orm'
import { lyrics, type Lyrics } from '../db/schema'
import type { LyricsProviderName } from '../../shared/lyrics'
import type { FetchedLyrics, LyricsProvider } from '../lyrics/provider'
import type { Akapela } from './akapela'

/**
 * The Lyrics Provider of that name, or undefined when this instance cannot
 * reach it: either it was never built, or it needs a token nobody configured.
 */
export function lyricsProviderNamed(akapela: Akapela, name: LyricsProviderName): LyricsProvider | undefined {
  return akapela.lyricsProviders.find(provider => provider.name === name && provider.available)
}

/** The Lyrics attached to a Track, or null when it has none. */
export function getLyrics(akapela: Akapela, trackId: string): Lyrics | null {
  return akapela.db.select().from(lyrics).where(eq(lyrics.trackId, trackId)).get() ?? null
}

/**
 * Puts what a provider returned in place of whatever the Track had. Passing
 * null clears the Lyrics, which is what a Song with none deserves: leaving the
 * previous Song's words on screen would be worse than showing none.
 */
export function replaceLyrics(
  akapela: Akapela,
  trackId: string,
  found: (FetchedLyrics & { provider: LyricsProviderName }) | null,
): Lyrics | null {
  const row: Lyrics | null = found && {
    trackId,
    provider: found.provider,
    kind: found.kind,
    lines: found.lines,
    fetchedAt: Date.now(),
  }
  akapela.db.transaction((tx) => {
    tx.delete(lyrics).where(eq(lyrics.trackId, trackId)).run()
    if (row) tx.insert(lyrics).values(row).run()
  })
  return row
}
