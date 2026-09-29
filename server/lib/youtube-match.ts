/**
 * Finding a song on YouTube for a Playlist Import: which of a search's results
 * is the song Spotify listed. Plain functions, so the ranking is tested on its
 * own; the search itself is `SourceFetcher.searchYoutube`.
 */

/** One search result, with what the ranking reads. */
export interface YoutubeSearchResult {
  /** A link to the single video. */
  url: string
  title: string
  /** The channel that uploaded it; an auto-generated artist channel ends in " - Topic". */
  uploader: string | null
  durationMs: number | null
}

/** How far a video's length may be from the song's before it is taken for another recording. */
export const MATCH_TOLERANCE_MS = 10_000

/** How many results one search asks for. */
export const SEARCH_RESULTS = 10

/** What is searched for: the song as Spotify lists it. */
export function youtubeSearchQuery(artist: string, title: string): string {
  return `${artist} - ${title}`
}

const MUSIC_VIDEO = /official\s+(music\s+)?video|music\s+video/i

/**
 * The result to import, or null when none is within ten seconds of the song.
 * Among those that are, an artist's " - Topic" channel comes first, since it
 * carries the recording itself; then anything that isn't a music video, whose
 * intro and outro would put the Lyrics out of step; then the rest. Ties keep
 * YouTube's own order.
 */
export function chooseYoutubeMatch(
  results: readonly YoutubeSearchResult[],
  durationMs: number | null,
): YoutubeSearchResult | null {
  const close = durationMs === null
    ? [...results]
    : results.filter(result => result.durationMs !== null && Math.abs(result.durationMs - durationMs) <= MATCH_TOLERANCE_MS)
  const rank = (result: YoutubeSearchResult) => {
    if (result.uploader?.trim().endsWith(' - Topic')) return 0
    if (!MUSIC_VIDEO.test(result.title)) return 1
    return 2
  }
  return close
    .map((result, order) => ({ result, order, rank: rank(result) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)[0]?.result ?? null
}
