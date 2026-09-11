import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * Puts the ffmpeg and ffprobe an installer will carry into
 * `desktop/vendor/<platform>-<arch>/`.
 *
 * ffmpeg is bundled and yt-dlp is not, and the asymmetry is the point
 * (ADR 0010): ffmpeg is stable and load-bearing for every import and every
 * Mix, while yt-dlp chases a moving target and breaks quarterly. This script
 * is the bundled half.
 *
 *   pnpm fetch-binaries                 the machine's own platform
 *   pnpm fetch-binaries -- --platform win32 --arch x64
 *   pnpm fetch-binaries -- --record     record the checksums rather than check them
 *
 * `--record` exists so a pin can be moved forward deliberately, by someone who
 * then commits the new checksums. It never runs as part of a build.
 */

const here = dirname(fileURLToPath(import.meta.url))
// Compiled into `dist/scripts/`, so the manifest and `vendor/` are two up.
const desktopRoot = resolve(here, '..', '..')
const manifestPath = join(desktopRoot, 'scripts', 'binaries.json')

interface BinarySpec {
  url: string | null
  sha256: string | null
  member: string
}

interface PlatformSpec {
  archive: 'zip' | 'tar.xz' | 'zip-per-binary'
  url?: string | null
  sha256?: string | null
  members?: Record<string, string>
  binaries?: Record<string, BinarySpec>
}

interface Manifest {
  platforms: Record<string, PlatformSpec>
}

function parseArgs(argv: string[]) {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    platform: (flag('platform') ?? process.platform) as NodeJS.Platform,
    arch: flag('arch') ?? process.arch,
    record: argv.includes('--record'),
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function download(url: string, label: string): Promise<Uint8Array> {
  process.stdout.write(`  downloading ${label}…\n`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Loud on purpose. A wrong ffmpeg in an installer someone else opens is not a
 * thing to shrug at, and a null checksum is an unverified pin rather than a
 * blank cheque.
 */
function verify(label: string, bytes: Uint8Array, expected: string | null, record: boolean): string {
  const actual = sha256(bytes)
  if (record) {
    process.stdout.write(`  ${label}: recorded sha256 ${actual}\n`)
    return actual
  }
  if (!expected) {
    throw new Error(
      `${label} has no checksum pinned in scripts/binaries.json. Nobody has verified this build. `
      + `Re-run with --record on a machine that can reach it, check what you got, and commit the result. `
      + `(it is ${actual} right now)`,
    )
  }
  if (actual !== expected) {
    throw new Error(
      `${label} does not match the pinned checksum.\n  expected ${expected}\n  got      ${actual}\n`
      + 'Either the publisher replaced the build under its own URL, or something is wrong. Do not ship it.',
    )
  }
  process.stdout.write(`  ${label}: checksum ok\n`)
  return actual
}

/**
 * Unpacked with the tools the platform already has — `tar` reads both zip and
 * tar.xz on Windows 10+ and on macOS, and GNU tar reads tar.xz on Linux. A zip
 * library would be a dependency for something the operating system does.
 */
function extract(archivePath: string, into: string, archive: PlatformSpec['archive']): void {
  mkdirSync(into, { recursive: true })
  if (archive === 'tar.xz') execFileSync('tar', ['-xJf', archivePath, '-C', into], { stdio: 'inherit' })
  else execFileSync('tar', ['-xf', archivePath, '-C', into], { stdio: 'inherit' })
}

async function main(): Promise<void> {
  const { platform, arch, record } = parseArgs(process.argv.slice(2))
  const key = `${platform}-${arch}`
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  const spec = manifest.platforms[key]
  if (!spec) {
    throw new Error(`scripts/binaries.json has no entry for ${key}. Add one, with a checksum.`)
  }

  const outDir = join(desktopRoot, 'vendor', key)
  const scratch = join(desktopRoot, 'vendor', `.${key}.tmp`)
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  mkdirSync(outDir, { recursive: true })

  process.stdout.write(`ffmpeg and ffprobe for ${key}\n`)
  const recorded: Record<string, string> = {}

  try {
    if (spec.archive === 'zip-per-binary') {
      for (const [name, binary] of Object.entries(spec.binaries ?? {})) {
        if (!binary.url) {
          throw new Error(
            `scripts/binaries.json has no URL for ${name} on ${key}. See the note on that entry — `
            + 'this platform still needs a publisher whose build carries librubberband.',
          )
        }
        const bytes = await download(binary.url, `${name} (${key})`)
        recorded[name] = verify(`${name} (${key})`, bytes, binary.sha256, record)
        const archivePath = join(scratch, `${name}.zip`)
        writeFileSync(archivePath, bytes)
        extract(archivePath, scratch, 'zip')
        writeFileSync(join(outDir, name), readFileSync(join(scratch, binary.member)))
      }
    }
    else {
      if (!spec.url) throw new Error(`scripts/binaries.json has no URL for ${key}.`)
      const bytes = await download(spec.url, key)
      recorded.archive = verify(key, bytes, spec.sha256 ?? null, record)
      const archivePath = join(scratch, spec.archive === 'tar.xz' ? 'ffmpeg.tar.xz' : 'ffmpeg.zip')
      writeFileSync(archivePath, bytes)
      extract(archivePath, scratch, spec.archive)
      for (const [name, member] of Object.entries(spec.members ?? {})) {
        const from = join(scratch, member)
        if (!existsSync(from)) throw new Error(`${member} is not in ${spec.url}. The archive's layout changed.`)
        writeFileSync(join(outDir, name), readFileSync(from))
      }
    }

    // No effect on Windows, where the extension decides.
    for (const name of ['ffmpeg', 'ffprobe', 'ffmpeg.exe', 'ffprobe.exe']) {
      const path = join(outDir, name)
      if (existsSync(path)) chmodSync(path, 0o755)
    }
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  if (record) {
    process.stdout.write('\nRecorded. Put these into scripts/binaries.json and commit them:\n')
    for (const [name, digest] of Object.entries(recorded)) process.stdout.write(`  ${key} ${name}: ${digest}\n`)
  }
  process.stdout.write(`\nDone: ${outDir}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
