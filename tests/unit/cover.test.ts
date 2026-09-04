import { describe, expect, test } from 'vitest'
import { coverContentType, coverExtension, placeholderCoverSvg } from '../../server/lib/cover'

describe('the type a cover file is served as', () => {
  test.each([
    ['cover.svg', 'image/svg+xml'],
    ['cover.jpg', 'image/jpeg'],
    ['cover.JPEG', 'image/jpeg'],
    ['cover.png', 'image/png'],
    ['cover.webp', 'image/webp'],
  ])('%s is %s', (path, type) => {
    expect(coverContentType(path)).toBe(type)
  })

  test('anything else is left for the browser to work out', () => {
    expect(coverContentType('cover.tiff')).toBe('application/octet-stream')
  })
})

describe('storing artwork fetched from the web', () => {
  test('is named after the type the host gave it', () => {
    expect(coverExtension('image/jpeg', 'https://images.genius.com/art')).toBe('jpg')
    expect(coverExtension('image/png', 'https://images.genius.com/art.jpg')).toBe('png')
  })

  test('falls back to the URL when the host said nothing useful', () => {
    expect(coverExtension('', 'https://images.genius.com/art.jpeg?w=500')).toBe('jpg')
    expect(coverExtension('application/octet-stream', 'https://images.genius.com/art.webp')).toBe('webp')
  })

  test('is refused when what arrived is not artwork, whatever the URL ends in', () => {
    expect(coverExtension('text/html', 'https://images.genius.com/art.jpg')).toBeUndefined()
    expect(coverExtension('', 'https://images.genius.com/art')).toBeUndefined()
  })
})

describe('the placeholder cover of a Track with no artwork', () => {
  test('is the title initial on an achromatic tile', () => {
    const svg = placeholderCoverSvg('yesterday')

    expect(svg).toContain('>Y</text>')
    expect(svg).toMatch(/fill="#[123]/)
  })

  test('escapes a title that would otherwise break the SVG', () => {
    expect(placeholderCoverSvg('<script>')).toContain('&lt;</text>')
  })
})
