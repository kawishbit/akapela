import { join, resolve } from 'node:path'

/**
 * Where the pieces the shell has to spawn actually live — in a packaged app,
 * and in a checkout.
 *
 * Both answers are pure string arithmetic over one root, so the packaged
 * layout can be checked without packaging anything. `main.ts` supplies the
 * roots: `process.resourcesPath` when `app.isPackaged`, the repo otherwise.
 *
 * The packaged tree is what `scripts/prepack.ts` stages and electron-builder
 * copies in as `extraResources` — outside the asar deliberately, because
 * every path here is either spawned as a process or read by one, and neither
 * can see inside an archive:
 *
 *   <resources>/output/server/index.mjs   the built Nitro server
 *   <resources>/output/public/…           its static assets, where it expects them
 *   <resources>/migrations/               the database migrates itself on startup
 *   <resources>/separators/…              the separation CLI, compiled to JavaScript
 *   <resources>/bin/ffmpeg|ffprobe        the pinned static builds
 *   <resources>/licenses/                 GPL-3.0 and the bundled binaries' texts
 */

export interface Layout {
  /** `.output/server/index.mjs`, spawned as the server child. */
  serverEntry: string
  /** Handed to the server as `NUXT_MIGRATIONS_DIR`. */
  migrationsDir: string
  ffmpeg: string
  ffprobe: string
  /** Handed to the server as `AKAPELA_SEPARATE_CLI`. */
  separateCli: string
  licensesDir: string
}

/** `.exe` on Windows and nothing anywhere else. */
export function executableName(name: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${name}.exe` : name
}

/** Where `scripts/fetch-binaries.ts` puts a platform's ffmpeg and ffprobe. */
export function vendorDir(desktopRoot: string, platform: NodeJS.Platform, arch: string): string {
  return join(desktopRoot, 'vendor', `${platform}-${arch}`)
}

/**
 * Where the app's own copy of yt-dlp lives: inside the library's cache, beside
 * the separation model, rather than inside the installer.
 *
 * yt-dlp chases a site that changes without warning and breaks every few
 * months by design, so it is fetched on first use and replaceable with one
 * click, while ffmpeg — stable and load-bearing for every import and every Mix
 * — is bundled (ADR 0010). Under the library rather than under the app means
 * it survives app updates, exactly as the separation model does.
 */
export function managedYtDlpPath(libraryDir: string, platform: NodeJS.Platform): string {
  return join(libraryDir, 'cache', 'bin', executableName('yt-dlp', platform))
}

/** A packaged app: everything is under Electron's `resourcesPath`. */
export function packagedLayout(resourcesPath: string, platform: NodeJS.Platform): Layout {
  return {
    serverEntry: join(resourcesPath, 'output', 'server', 'index.mjs'),
    migrationsDir: join(resourcesPath, 'migrations'),
    ffmpeg: join(resourcesPath, 'bin', executableName('ffmpeg', platform)),
    ffprobe: join(resourcesPath, 'bin', executableName('ffprobe', platform)),
    separateCli: join(resourcesPath, 'separators', 'server', 'lib', 'separators', 'separate-cli.js'),
    licensesDir: join(resourcesPath, 'licenses'),
  }
}

/**
 * A checkout: the server is whatever `pnpm build` last produced at the repo
 * root, and the separation CLI is the TypeScript file Node type-strips, which
 * is what `pnpm dev` and compose both run.
 */
export function developmentLayout(desktopRoot: string, platform: NodeJS.Platform, arch: string): Layout {
  const repoRoot = resolve(desktopRoot, '..')
  const vendor = vendorDir(desktopRoot, platform, arch)
  return {
    serverEntry: join(repoRoot, '.output', 'server', 'index.mjs'),
    migrationsDir: join(repoRoot, 'server', 'db', 'migrations'),
    ffmpeg: join(vendor, executableName('ffmpeg', platform)),
    ffprobe: join(vendor, executableName('ffprobe', platform)),
    separateCli: join(repoRoot, 'server', 'lib', 'separators', 'separate-cli.ts'),
    licensesDir: join(desktopRoot, 'resources', 'licenses'),
  }
}
