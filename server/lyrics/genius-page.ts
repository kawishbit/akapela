/**
 * Reading the words off a Genius song page.
 *
 * Genius has no lyrics endpoint, so the words come from the page's HTML. That
 * HTML is the one part of the provider that changes without warning, so it is
 * scraped here and nowhere else: when Genius reshapes its pages, this file and
 * its fixtures are what need fixing, and the provider around it stays put.
 */

/** The element Genius wraps each block of words in today. */
const LYRICS_CONTAINER = 'data-lyrics-container'

/** Marks the contributor and translation header that sits inside that element. */
const EXCLUDED = 'data-exclude-from-selection'

/** How Genius wrapped the words before it moved to containers; some pages still do. */
const LEGACY_LYRICS_CLASS = /class\s*=\s*["'][^"']*\blyrics\b[^"']*["']/i

/** `[Verse 1]`, `[Chorus]`: how the page is built, not words anyone sings. */
const SECTION_MARKER = /^\[[^\]]*\]$/

/**
 * The Lyrics on a Genius song page, one string per line sung, with a single
 * blank line where the page leaves a gap between verses. A page with no words
 * on it — a 404, a page whose shape has moved on — reads as none, so the
 * singer is told the provider has no Lyrics rather than shown page furniture.
 */
export function lyricsFromGeniusPage(html: string): string[] {
  const body = removeElements(html, tag => /^(script|style)$/i.test(tag.name))
  const containers = findElements(body, tag => tag.attributes.includes(LYRICS_CONTAINER))
  const blocks = containers.length ? containers : findElements(body, isLegacyLyricsDiv)
  const sections = blocks
    .map(block => textOf(removeElements(block, tag => tag.attributes.includes(EXCLUDED))))
    .map(text => tidy(text.split('\n')))
    .filter(lines => lines.length > 0)
  // Genius puts each stretch of words in a container of its own, so the seam
  // between two of them is a gap between verses.
  return sections.flatMap((lines, index) => (index === 0 ? lines : ['', ...lines]))
}

function isLegacyLyricsDiv(tag: Tag): boolean {
  return tag.name.toLowerCase() === 'div' && LEGACY_LYRICS_CLASS.test(tag.attributes)
}

/** One opening or closing tag, as the scanner reads it. */
interface Tag {
  name: string
  /** Everything between the tag name and the closing angle bracket. */
  attributes: string
  closing: boolean
  selfClosing: boolean
  start: number
  end: number
}

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g

function* tags(html: string): Generator<Tag> {
  TAG.lastIndex = 0
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    yield {
      name: match[2]!,
      attributes: match[3]!,
      closing: match[1] === '/',
      selfClosing: match[3]!.trimEnd().endsWith('/'),
      start: match.index,
      end: match.index + match[0].length,
    }
  }
}

/**
 * The inner HTML of every element whose opening tag `wanted` accepts. Nesting
 * of the same tag name is counted, so an element holding `<div>`s comes back
 * whole. Elements inside a match are not searched again.
 */
function findElements(html: string, wanted: (tag: Tag) => boolean): string[] {
  const found: string[] = []
  let open: { name: string, from: number, depth: number } | null = null
  for (const tag of tags(html)) {
    if (!open) {
      if (!tag.closing && !tag.selfClosing && wanted(tag)) open = { name: tag.name, from: tag.end, depth: 1 }
      continue
    }
    if (tag.name !== open.name || tag.selfClosing) continue
    open.depth += tag.closing ? -1 : 1
    if (open.depth === 0) {
      found.push(html.slice(open.from, tag.start))
      open = null
    }
  }
  // An element the page never closed still holds words worth reading.
  if (open) found.push(html.slice(open.from))
  return found
}

/** The same HTML with every element `unwanted` accepts, and everything inside it, gone. */
function removeElements(html: string, unwanted: (tag: Tag) => boolean): string {
  let out = ''
  let copiedTo = 0
  let open: { name: string, from: number, depth: number } | null = null
  for (const tag of tags(html)) {
    if (!open) {
      if (!tag.closing && !tag.selfClosing && unwanted(tag)) {
        out += html.slice(copiedTo, tag.start)
        open = { name: tag.name, from: tag.start, depth: 1 }
      }
      continue
    }
    if (tag.name !== open.name || tag.selfClosing) continue
    open.depth += tag.closing ? -1 : 1
    if (open.depth === 0) {
      copiedTo = tag.end
      open = null
    }
  }
  return open ? out : out + html.slice(copiedTo)
}

/** Line breaks that separate sung lines: `<br>`, and the end of a block that wraps one. */
const LINE_BREAK = /<br\s*\/?>|<\/(p|div|li|h[1-6])\s*>/gi

const REMAINING_TAGS = /<[^>]*>/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  mdash: '—',
  ndash: '–',
}

const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi

/** The words inside a block of HTML, with a newline wherever the markup broke a line. */
function textOf(html: string): string {
  return decodeEntities(html.replace(LINE_BREAK, '\n').replace(REMAINING_TAGS, ''))
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (entity, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : entity
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity
  })
}

/**
 * The lines as a singer wants them: no section markers, no padding around the
 * words, and one blank line where the page left a gap however wide.
 */
function tidy(lines: string[]): string[] {
  const kept: string[] = []
  for (const line of lines) {
    const text = line.replace(/\s+/g, ' ').trim()
    if (SECTION_MARKER.test(text)) continue
    if (!text && (kept.length === 0 || !kept[kept.length - 1])) continue
    kept.push(text)
  }
  while (kept.length && !kept[kept.length - 1]) kept.pop()
  return kept
}
