import { resolve } from 'node:path'

/**
 * Where the four external things Akapela shells out to are found.
 *
 * In the compose image and in every development loop the answer is a
 * convention: the Dockerfile installs `ffmpeg`, `ffprobe`, and `yt-dlp` onto
 * `PATH`, and copies `separate-cli.ts` to a fixed place under `/app`, which is
 * the cwd. A packaged desktop app has neither a controlled `PATH` nor a
 * meaningful cwd, so it sets an environment override per tool and gets
 * absolute paths instead (ticket 02 of `.scratch/desktop-app/`).
 *
 * Deliberately the dumbest thing that works: a function per tool, an
 * environment variable per tool, and a fallback that is the previous
 * behaviour verbatim. No detection, no probing, no registry. Nothing here
 * imports Electron — these are plain functions so the suite can test them.
 */

/** Trimmed, so an override set to an empty string falls back rather than spawning `''`. */
function override(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/** The two halves of ffmpeg this app spawns, each with its own override. */
export type FfmpegTool = 'ffmpeg' | 'ffprobe'

/** `AKAPELA_FFMPEG` or `AKAPELA_FFPROBE`, else the bare name off `PATH`. */
export function ffmpegToolPath(tool: FfmpegTool): string {
  return override(tool === 'ffmpeg' ? 'AKAPELA_FFMPEG' : 'AKAPELA_FFPROBE') ?? tool
}

/** `AKAPELA_YTDLP`, else the bare name off `PATH`. */
export function ytDlpPath(): string {
  return override('AKAPELA_YTDLP') ?? 'yt-dlp'
}

/**
 * `AKAPELA_SEPARATE_CLI`, else the TypeScript entry point resolved against
 * `process.cwd()` — the repo root under `pnpm dev`/`aspire run` and `/app` in
 * the compose image. Not `import.meta.url`, which Nitro rewrites into its own
 * `.nuxt` virtual module namespace rather than a real filesystem path. The
 * desktop build overrides this with the compiled JavaScript inside the app
 * bundle (ticket 05).
 */
export function separateCliPath(): string {
  return override('AKAPELA_SEPARATE_CLI') ?? resolve(process.cwd(), 'server/lib/separators/separate-cli.ts')
}

/**
 * An explicit path to the JavaScript runtime yt-dlp uses to solve YouTube's
 * player challenges, or undefined to let it find `node` on the `PATH`.
 *
 * Set by the desktop shell to Electron's own binary, which behaves as plain
 * Node when `ELECTRON_RUN_AS_NODE=1` is in its environment — `childEnv` sets
 * that, and yt-dlp passes its own environment down to the runtime it spawns.
 * A singer who downloaded an installer has no Node on their `PATH`, and
 * without a runtime YouTube import is close to broken rather than slightly
 * worse (ticket 07 of `.scratch/desktop-app/`).
 */
export function jsRuntimePath(): string | undefined {
  return override('AKAPELA_JS_RUNTIME')
}

/**
 * Whether this Akapela owns the yt-dlp binary at `ytDlpPath()` — may download
 * it when a YouTube import needs one, and may replace it when Settings asks.
 *
 * True only on the desktop, where yt-dlp lives in the library's cache. The
 * compose image bakes its own in and sets none of this, so nothing there ever
 * downloads or replaces a binary (ADR 0010).
 */
export function ytDlpIsManaged(): boolean {
  return process.env.AKAPELA_MANAGE_YTDLP === '1' && override('AKAPELA_YTDLP') !== undefined
}

/**
 * The environment a spawned child gets on top of this process's own.
 *
 * `ELECTRON_RUN_AS_NODE=1` is what stops Electron from launching a second
 * copy of the GUI app when the separation subprocess spawns
 * `process.execPath` — under Electron that path is the app binary, not a Node
 * one. Setting it unconditionally is harmless outside Electron, where plain
 * Node ignores it, which keeps this one code path rather than two.
 */
export function childEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extra }
}
