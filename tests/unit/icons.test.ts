import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { BACKGROUND, MAC_CORNER_RADIUS, SIZE, rounded, square } from '../../scripts/icon-shapes.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const at = (...parts: string[]) => join(root, ...parts)

const MARK = at('logos', 'logo.svg')
const REGENERATE = 'run `pnpm icons:generate`'

/** The mark's background, which is the only thing rounding may remove. */
const background = [1, 3, 5].map(i => Number.parseInt(BACKGROUND.slice(i, i + 2), 16))

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    width: info.width,
    height: info.height,
    at: (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!] as const
    },
  }
}

const isBackground = ([r, g, b]: readonly number[]) =>
  Math.abs(r! - background[0]!) < 16 && Math.abs(g! - background[1]!) < 16 && Math.abs(b! - background[2]!) < 16

describe('the mark', () => {
  it('is served from `public/` byte-for-byte as it is in `logos/`', async () => {
    const [mark, served] = await Promise.all([readFile(MARK), readFile(at('public', 'logo.svg'))])
    expect(served.equals(mark), `public/logo.svg has drifted from logos/logo.svg — ${REGENERATE}`).toBe(true)
  })
})

describe('the generated icons', () => {
  it.for([
    ['logos/logo.png'],
    ['desktop/resources/icon.png'],
    ['desktop/resources/icon-mac.png'],
  ])('%s is committed at the full canvas size', async ([path]) => {
    const meta = await sharp(at(...path!.split('/'))).metadata()
    expect({ width: meta.width, height: meta.height }, `${path} is not ${SIZE}px — ${REGENERATE}`)
      .toEqual({ width: SIZE, height: SIZE })
  })

  it('gives Windows and Linux the mark full-bleed, corners included', async () => {
    const png = await pixels(await readFile(at('desktop', 'resources', 'icon.png')))
    for (const [x, y] of [[0, 0], [SIZE - 1, 0], [0, SIZE - 1], [SIZE - 1, SIZE - 1]]) {
      const [, , , alpha] = png.at(x!, y!)
      expect(alpha, `the full-bleed icon should be opaque at ${x},${y}`).toBe(255)
    }
  })

  it('gives macOS the same mark with its corners cut away', async () => {
    const png = await pixels(await readFile(at('desktop', 'resources', 'icon-mac.png')))
    expect(png.at(0, 0)[3], 'the macOS icon should be transparent in its corners').toBe(0)
    expect(png.at(SIZE - 1, SIZE - 1)[3], 'the macOS icon should be transparent in its corners').toBe(0)
    expect(png.at(SIZE / 2, 0)[3], 'the macOS icon should still reach its edges mid-side').toBe(255)
    expect(png.at(SIZE / 2, SIZE / 2)[3], 'the macOS icon should be opaque at its centre').toBe(255)
  })
})

describe('rounding the macOS corners', () => {
  // The whole reason macOS can take the same mark as everything else: the
  // glyph is inset far enough that a squircle only ever removes background.
  // An edit to the mark that moved the glyph outward would start clipping it
  // with nothing else to notice, so this is the thing that notices.
  it('removes only background, never any part of the glyph', async () => {
    const [flat, cut] = await Promise.all([pixels(await square(MARK)), pixels(await rounded(MARK))])

    let removed = 0
    const clipped: string[] = []
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (cut.at(x, y)[3] !== 0) continue
        removed++
        if (!isBackground(flat.at(x, y))) clipped.push(`${x},${y}`)
      }
    }

    expect(removed, 'the corner mask should be removing something').toBeGreaterThan(0)
    expect(clipped.slice(0, 5), `rounding clipped ${clipped.length} glyph pixels — the mark's glyph has moved too close to its corners`)
      .toEqual([])
  })

  it('cuts the corners deeply enough to read as rounded, but not so deep it eats the mark', () => {
    expect(MAC_CORNER_RADIUS).toBeGreaterThan(0.15)
    expect(MAC_CORNER_RADIUS).toBeLessThan(0.3)
  })
})
