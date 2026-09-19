import { describe, expect, test } from 'vitest'
import { coverContentType, coverExtension, placeholderCoverSvg, uploadedCoverExtension } from '../../server/lib/cover'

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

describe('artwork the singer uploads', () => {
  const bytes = (...head: number[]) => new Uint8Array([...head, 0, 0, 0, 0, 0, 0, 0, 0])

  test.each([
    ['a PNG', bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A), 'png'],
    ['a JPEG', bytes(0xFF, 0xD8, 0xFF, 0xE0), 'jpg'],
    ['a WebP', bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50), 'webp'],
  ])('%s is stored as what its bytes say it is', (_case, file, ext) => {
    expect(uploadedCoverExtension(file)).toBe(ext)
  })

  test('is judged by its bytes, not by what it is called', () => {
    expect(uploadedCoverExtension(new TextEncoder().encode('<html>not a picture</html>'))).toBeUndefined()
  })

  test('an SVG is refused, since it can carry script the app would serve as its own', () => {
    expect(uploadedCoverExtension(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeUndefined()
  })

  test('a RIFF file that is not WebP is refused', () => {
    expect(uploadedCoverExtension(bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeUndefined()
  })

  test('an empty file is refused', () => {
    expect(uploadedCoverExtension(new Uint8Array())).toBeUndefined()
  })
})
