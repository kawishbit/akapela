/**
 * YouTube URL handling shared by the API, which rejects anything that is not a
 * single video, and the library page, which can tell a singer before sending.
 */

/** A YouTube video id: eleven URL-safe base64 characters. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Hosts that serve videos, once a `www.`, `m.`, or `music.` prefix is dropped. */
const VIDEO_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com'])

/** Path prefixes under which the second segment is the video id. */
const ID_IN_PATH = new Set(['shorts', 'embed', 'live', 'v'])

export const INVALID_YOUTUBE_URL_MESSAGE
  = 'Paste a link to a single YouTube video, like https://youtu.be/xxxxxxxxxxx'

/**
 * The video id in a YouTube URL, or null when the text does not point at one
 * video. Accepts watch, youtu.be, shorts, embed, and live URLs, with or
 * without a scheme. Playlist and channel URLs are not videos.
 */
export function youtubeVideoId(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  const [first, second, third] = url.pathname.split('/').filter(Boolean)
  let id: string | null | undefined
  if (host === 'youtu.be') {
    if (second === undefined) id = first
  }
  else if (VIDEO_HOSTS.has(host)) {
    if (first === 'watch') id = url.searchParams.get('v')
    else if (first && ID_IN_PATH.has(first) && third === undefined) id = second
  }
  return id && VIDEO_ID.test(id) ? id : null
}

/** The one URL a Track stores for a video, whatever form the singer pasted. */
export function canonicalYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/** The stand-in title a YouTube Track carries until the worker has fetched the video's own. */
export function youtubePlaceholderTitle(videoId: string): string {
  return `youtu.be/${videoId}`
}
