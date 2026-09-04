import { describe, expect, test } from 'vitest'
import { lyricsFromGeniusPage } from '../../server/lyrics/genius-page'

/**
 * A Genius song page as it is shipped today, cut down to the parts the scraper
 * reads: a lyrics container holding an excluded header, `<br>` between lines,
 * annotation links around some of them, and section markers.
 */
const PAGE = `<!doctype html><html><head><title>The Beatles - Yesterday Lyrics | Genius</title>
<script>window.__PRELOADED_STATE__ = {"lyrics":"not here"}</script></head>
<body><div class="SongPage__Section">
<div data-lyrics-container="true" class="Lyrics__Container-sc-1ynbvzw-1">
<div data-exclude-from-selection="true" class="LyricsHeader__Container">42 Contributors<div>Translations</div></div>
[Verse 1]<br/>Yesterday<br/><a href="/12-annotated" class="ReferentFragment"><span>All my troubles seemed so far away</span></a><br/>
<br/>[Chorus]<br/>Why she had to go &amp; I don&#39;t know
</div>
<div data-lyrics-container="true" class="Lyrics__Container-sc-1ynbvzw-1">She wouldn&rsquo;t say<br>Yesterday</div>
</div></body></html>`

describe('reading the Lyrics off a Genius song page', () => {
  test('takes the words out of every lyrics container, one line per sung line', () => {
    expect(lyricsFromGeniusPage(PAGE)).toEqual([
      'Yesterday',
      'All my troubles seemed so far away',
      '',
      'Why she had to go & I don\'t know',
      '',
      'She wouldn’t say',
      'Yesterday',
    ])
  })

  test('leaves out the contributor header the page excludes from a copy', () => {
    expect(lyricsFromGeniusPage(PAGE)).not.toContain('42 Contributors')
  })

  test('reads the older pages that wrap the words in a lyrics div', () => {
    const html = '<div class="lyrics"><p>[Intro]\nYesterday\n\nAll my troubles</p></div>'

    expect(lyricsFromGeniusPage(html)).toEqual(['Yesterday', '', 'All my troubles'])
  })

  test('a page with no lyrics on it reads as none, rather than as the whole page', () => {
    expect(lyricsFromGeniusPage('<html><body><h1>Page not found</h1></body></html>')).toEqual([])
  })

  test('a container holding only section markers is no Lyrics at all', () => {
    expect(lyricsFromGeniusPage('<div data-lyrics-container="true">[Instrumental]</div>')).toEqual([])
  })

  test('keeps one blank line between verses however many the page has', () => {
    const html = '<div data-lyrics-container="true">One<br><br><br>Two</div>'

    expect(lyricsFromGeniusPage(html)).toEqual(['One', '', 'Two'])
  })
})
