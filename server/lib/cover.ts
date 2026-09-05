/**
 * Cover art: what the Track shows in the library and the only colour on the
 * Sing screen. This module knows the shapes and types of cover files; writing
 * one into a Track's directory belongs to `tracks`.
 */

/** Every cover the app serves, and how it says what it is. Nothing else is written. */
export const COVER_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** How the app answers when it serves a cover file. */
export function coverContentType(coverPath: string): string {
  const ext = coverPath.split('.').pop()?.toLowerCase() ?? ''
  return COVER_TYPES[ext] ?? 'application/octet-stream'
}

/** The cover files in a Track directory are all named this, with the type as the extension. */
export const COVER_BASENAME = 'cover'

/** Content types that say nothing, so the URL is the better guess at what arrived. */
const UNTYPED = ['', 'application/octet-stream', 'binary/octet-stream']

/**
 * The extension a cover fetched over HTTP is stored under, or undefined when
 * what arrived is not an image Akapela serves. A host that named a type is
 * believed: art that says it is HTML is an error page, not artwork.
 */
export function coverExtension(contentType: string, url: string): string | undefined {
  const named = Object.keys(COVER_TYPES).find(ext => COVER_TYPES[ext] === contentType && ext !== 'jpeg')
  if (named) return named
  if (!UNTYPED.includes(contentType)) return undefined
  const suffix = url.split('?')[0]!.split('.').pop()?.toLowerCase() ?? ''
  const ext = suffix === 'jpeg' ? 'jpg' : suffix
  return ext in COVER_TYPES && ext !== 'jpeg' ? ext : undefined
}

/**
 * Generated placeholder cover art for Tracks that have no artwork yet. Achromatic
 * by design (DESIGN.md §8): a charcoal tile whose shade is derived from the title,
 * with the title's first letter set large in silver.
 */
export function placeholderCoverSvg(title: string): string {
  const initial = escapeXml((title.trim()[0] ?? '?').toUpperCase())
  // Spread titles across a handful of charcoal shades so a grid of placeholders
  // is not a single flat block.
  const shades = ['#1f1f1f', '#252525', '#272727', '#2e2e2e', '#333333']
  const shade = shades[hash(title) % shades.length]
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    `<rect width="512" height="512" fill="${shade}"/>`,
    '<text x="256" y="256" fill="#b3b3b3" font-family="Figtree, Helvetica Neue, Helvetica, Arial, sans-serif"',
    ` font-size="288" font-weight="700" text-anchor="middle" dominant-baseline="central">${initial}</text>`,
    '</svg>',
    '',
  ].join('\n')
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
