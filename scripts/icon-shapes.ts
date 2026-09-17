/**
 * The shapes every Akapela icon is cut to, apart from the script that writes
 * them (`scripts/icons.ts`), so the test suite can check the geometry without
 * regenerating anything.
 */
import sharp from 'sharp'

/**
 * What every icon is rendered at. Apple's only current published number for an
 * app icon is the 1024 x 1024 canvas, and it is at or above what Windows and
 * Linux want, so one size serves all three.
 */
export const SIZE = 1024

/**
 * How far the corners are cut on the macOS icon, as a fraction of the canvas.
 *
 * macOS does not get the full-bleed square the other platforms get. macOS 26
 * masks app icons to a squircle itself and clips whatever falls outside it;
 * macOS 15 and earlier mask nothing, so the same square renders as a hard tile
 * among rounded neighbours. Rounding the corners here satisfies both: 26 clips
 * the leftover background invisibly, and 15 sees a proper app icon.
 *
 * What it deliberately does *not* do is inset the mark. The widely-cited
 * "824 x 824 body on a 1024 canvas, 185.4pt radius" is not Apple guidance — it
 * appears nowhere in the current Human Interface Guidelines and is
 * reverse-engineered from Apple's retired flat-icon templates. Under 26's mask
 * that inset is actively wrong: the icon would render visibly smaller than
 * every peer in the Dock.
 *
 * Icon Composer is the real answer on 26, and it is a layered format that
 * needs the mark re-authored on a Mac and Xcode 26 on the build machine. It is
 * tracked in `.scratch/mac-signing/`; this is the best a flat icon can do.
 */
export const MAC_CORNER_RADIUS = 0.225

/**
 * The mark's own background colour.
 *
 * It has to be named here because the mark does not quite fill its canvas: the
 * transform on its background rect leaves its bottom edge a fraction of a
 * pixel short, which renders as a faintly translucent line along the bottom of
 * an otherwise opaque icon. Flattening onto the same colour fills that sliver.
 * `pwa-assets.config.ts` passes the same colour for the same reason.
 */
export const BACKGROUND = '#87ea5c'

/** Renders the mark, unchanged, to an opaque square PNG. */
export async function square(mark: string, size: number = SIZE): Promise<Buffer> {
  return await sharp(mark, { density: 384 })
    .resize(size, size, { fit: 'contain', background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .png()
    .toBuffer()
}

/**
 * Renders the mark with its corners rounded. Safe to do without touching the
 * glyph only because the glyph is inset well inside the corners — which
 * `tests/unit/icons.test.ts` holds true, since an edit to the mark that moved
 * it outward would otherwise start clipping it silently.
 */
export async function rounded(mark: string, size: number = SIZE): Promise<Buffer> {
  const radius = Math.round(size * MAC_CORNER_RADIUS)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )
  return await sharp(await square(mark, size))
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}
