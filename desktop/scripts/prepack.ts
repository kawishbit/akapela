import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * Stages everything electron-builder copies in as `extraResources`.
 *
 * Outside the asar deliberately: every path staged here is either spawned as a
 * process or read by one, and neither can see inside an archive.
 *
 *   staging/output/      the built Nitro server and its public assets, in the
 *                        shape `.output` already has, because `index.mjs`
 *                        looks for `../public` beside itself
 *   staging/migrations/  the database migrates itself on startup
 *   staging/separators/  the separation CLI, compiled to JavaScript
 *   staging/bin/         the pinned ffmpeg and ffprobe
 *   staging/licenses/    GPL-3.0 and the bundled binaries' licence texts
 *
 * The separation CLI is compiled rather than shipped as TypeScript: today
 * `separate-cli.ts` is run directly by Node 24's native type-stripping, and
 * betting a signed installer on Electron's Node having that enabled is not a
 * bet worth taking. It is three files plus `app/audio/wav.ts`, so this is a
 * `tsc` invocation and not a build system.
 */

const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '..', '..')
const repoRoot = resolve(desktopRoot, '..')
const staging = join(desktopRoot, 'staging')

const platform = (process.env.AKAPELA_TARGET_PLATFORM ?? process.platform) as NodeJS.Platform
const arch = process.env.AKAPELA_TARGET_ARCH ?? process.arch

function step(message: string): void {
  process.stdout.write(`${message}\n`)
}

function requireDir(path: string, how: string): void {
  if (!existsSync(path)) throw new Error(`${path} is missing. ${how}`)
}

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
}

function stageServer(): void {
  const output = join(repoRoot, '.output')
  requireDir(output, 'Run `pnpm build` at the repo root first.')
  step('staging the server')
  cpSync(output, join(staging, 'output'), { recursive: true })

  step('staging the migrations')
  cpSync(join(repoRoot, 'server', 'db', 'migrations'), join(staging, 'migrations'), { recursive: true })
}

/**
 * Compiles the separation CLI and the three modules it imports, keeping their
 * repo-relative shape so the imports between them still resolve.
 * `rewriteRelativeImportExtensions` is what turns the explicit `.ts`
 * specifiers — which Node's type-stripping requires — into the `.js` ones the
 * emitted files need.
 */
function stageSeparators(): void {
  step('compiling the separation CLI')
  const out = join(staging, 'separators')
  mkdirSync(out, { recursive: true })
  run('npx', [
    'tsc',
    join(repoRoot, 'server', 'lib', 'separators', 'separate-cli.ts'),
    '--module', 'nodenext',
    '--moduleResolution', 'nodenext',
    '--target', 'es2022',
    '--skipLibCheck',
    '--allowImportingTsExtensions',
    '--rewriteRelativeImportExtensions',
    '--rootDir', repoRoot,
    '--outDir', out,
  ], desktopRoot)

  // The emitted tree needs to be ESM, and the nearest package.json is what
  // says so.
  writeFileSync(join(out, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`)

  step('installing the separation CLI\'s own dependencies')
  const separators = join(out, 'server', 'lib', 'separators')
  cpSync(join(repoRoot, 'server', 'lib', 'separators', 'package.json'), join(separators, 'package.json'))
  cpSync(join(repoRoot, 'server', 'lib', 'separators', 'pnpm-lock.yaml'), join(separators, 'pnpm-lock.yaml'))
  // `ONNXRUNTIME_NODE_INSTALL=skip` keeps its postinstall from reaching out to
  // NuGet for a ~220MB CUDA execution provider this app never asks for —
  // `mdx-net.ts` creates its session with `executionProviders: ['cpu']`. The
  // Dockerfile's long comment is the full version of this.
  run('pnpm', ['install', '--prod', '--frozen-lockfile', '--ignore-workspace'], separators)

  pruneOnnxRuntime(join(separators, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6'))
}

/**
 * onnxruntime-node ships every platform's binary in one package regardless of
 * which one installs it — over 200MB of platforms this installer will never
 * run on. Keeping only the target's is the difference between an installer
 * that ships every platform and one that ships one.
 */
function pruneOnnxRuntime(napiDir: string): void {
  if (!existsSync(napiDir)) return
  step(`pruning onnxruntime-node to ${platform}/${arch}`)
  for (const entry of readdirSync(napiDir)) {
    if (entry !== platform) rmSync(join(napiDir, entry), { recursive: true, force: true })
  }
  const platformDir = join(napiDir, platform)
  if (!existsSync(platformDir)) return
  for (const entry of readdirSync(platformDir)) {
    if (entry !== arch) rmSync(join(platformDir, entry), { recursive: true, force: true })
  }
}

function stageBinaries(): void {
  const vendor = join(desktopRoot, 'vendor', `${platform}-${arch}`)
  requireDir(vendor, `Run \`pnpm fetch-binaries -- --platform ${platform} --arch ${arch}\` first.`)
  step('staging ffmpeg and ffprobe')
  cpSync(vendor, join(staging, 'bin'), { recursive: true })
}

/**
 * GPL-3.0 with GPL binaries in the installer: the licence texts ship, and the
 * app links to them. That is the whole obligation.
 */
function stageLicenses(): void {
  step('staging the licences')
  const out = join(staging, 'licenses')
  mkdirSync(out, { recursive: true })
  cpSync(join(repoRoot, 'LICENSE'), join(out, 'akapela-GPL-3.0.txt'))
  const bundled = join(desktopRoot, 'resources', 'licenses')
  if (existsSync(bundled)) cpSync(bundled, out, { recursive: true })
}

function main(): void {
  step(`staging a ${platform}-${arch} build`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  stageServer()
  stageSeparators()
  stageBinaries()
  stageLicenses()
  step(`\nStaged at ${staging}`)
}

try {
  main()
}
catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
