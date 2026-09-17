/**
 * Every icon Akapela shows, regenerated from the one mark.
 *
 *   pnpm icons:generate
 *
 * `logos/logo.svg` is the source of truth. `logos/logo.af` is the master a
 * human edits; export the SVG from it and run this. Everything this writes is
 * committed, so a wrong icon turns up in a PR diff rather than in a shipped
 * DMG, and a cold CI runner needs nothing to build one.
 *
 * The web and PWA set is still declared in `pwa-assets.config.ts` and still
 * produced by `pwa-assets-generator`, which this spawns rather than
 * reimplements: that package owns the favicon's frame sizes and the PNG
 * compression, and hand-rolling them here would drift from what it produces.
 * It reads `public/logo.svg`, which is why the copy happens first.
 *
 * The desktop icons are ours, because electron-builder takes a file per
 * platform and macOS needs a different shape (`scripts/icon-shapes.ts`).
 */
import { spawn } from 'node:child_process'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rounded, square } from './icon-shapes.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const at = (...parts: string[]) => join(root, ...parts)

/** The mark. Everything below is derived from this one file. */
const MARK = at('logos', 'logo.svg')

async function write(path: string, contents: Buffer, describe: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  console.log(`  ${relative(root, path).replaceAll('\\', '/')}  — ${describe}`)
}

/**
 * `pwa-assets-generator` resolved the way Node resolves it rather than off a
 * guessed path: pnpm does not hoist it into `node_modules/`, and its bin is a
 * shell shim that spawns differently on Windows. Running its entry with this
 * same Node avoids both.
 */
function generateWebAssets(): Promise<void> {
  const cli = join(dirname(createRequire(import.meta.url).resolve('@vite-pwa/assets-generator/config')), 'cli.mjs')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli], { cwd: root, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`pwa-assets-generator exited with ${code}`)))
  })
}

// The mark, where the app can serve it. It has to live under `public/` to be
// reachable at `/logo.svg` — by the browser, by the PWA manifest and by
// `TitleBar.vue` — so this is a copy rather than a reference. A test fails if
// the two ever stop matching.
await copyFile(MARK, at('public', 'logo.svg'))
console.log(`  public/logo.svg  — the mark, served at /logo.svg`)

// Favicon, apple-touch icon and the PWA set, from the copy just made.
await generateWebAssets()

// A raster of the mark for anywhere that cannot take an SVG: release notes, an
// issue template, a social preview.
await write(at('logos', 'logo.png'), await square(MARK), 'the mark as a raster')

// Windows and Linux. electron-builder finds this by name in the directory
// `desktop/electron-builder.yml` already declares as its build resources, so
// it needs no config key of its own.
await write(at('desktop', 'resources', 'icon.png'), await square(MARK), 'the Desktop App on Windows and Linux')

// macOS, which `electron-builder.yml` points at explicitly.
await write(at('desktop', 'resources', 'icon-mac.png'), await rounded(MARK), 'the Desktop App on macOS')
