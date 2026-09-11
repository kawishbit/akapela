/**
 * What the renderer — the ordinary Nuxt app, served over http from the child
 * process — can ask the shell for.
 *
 * Kept as small as it can be (ADR 0009: the shell is thin on purpose). Only
 * two things genuinely need the operating system: a native folder picker for
 * the library, and opening a link or a folder outside the app. Everything
 * else the Settings page does — updating yt-dlp included — is an ordinary API
 * route on the server, because that is where the data directory is.
 *
 * `app/types.d.ts` declares the matching `window.akapela` for the Nuxt side;
 * its presence is also how the app knows it is running as the Desktop App.
 */

export interface DesktopUpdate {
  version: string
  url: string
}

export interface LibraryChange {
  ok: boolean
  /** The folder now in use — unchanged when the singer cancelled or it was refused. */
  dir: string
  /** Why it was refused, in a sentence a singer can act on. */
  error?: string
  /** True when the picker was dismissed, which is not an error. */
  cancelled?: boolean
}

export interface AkapelaBridge {
  /** Always true; the Nuxt app tests for this object's existence, not this field. */
  desktop: true
  version: string
  platform: NodeJS.Platform
  libraryDir: () => Promise<string>
  chooseLibraryDir: () => Promise<LibraryChange>
  revealLibraryDir: () => Promise<void>
  /** The newer release if the startup check found one, else null. */
  update: () => Promise<DesktopUpdate | null>
  openExternal: (url: string) => Promise<void>
}

export const BRIDGE_CHANNELS = {
  libraryDir: 'akapela:library-dir',
  chooseLibraryDir: 'akapela:choose-library-dir',
  revealLibraryDir: 'akapela:reveal-library-dir',
  update: 'akapela:update',
  openExternal: 'akapela:open-external',
} as const
