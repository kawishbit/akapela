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
 * Updates are the exception that earns its place: the prompt is part of the
 * app (a native dialog would interrupt a Take), but only the shell can install
 * one or restart into it, so the whole of that flow crosses here.
 *
 * `app/types.d.ts` declares the matching `window.akapela` for the Nuxt side;
 * its presence is also how the app knows it is running as the Desktop App.
 */

export interface DesktopUpdate {
  version: string
  url: string
}

/**
 * What a check the singer asked for came back with. A launch check only ever
 * reports an Update or says nothing; **Check now** has to be able to say "you
 * are on the latest" and "I could not reach GitHub" as different answers.
 */
export type DesktopUpdateCheck =
  | { state: 'available', update: DesktopUpdate }
  | { state: 'current' }
  | { state: 'failed' }

/** How this build can take an Update: install it itself, or open the download page. */
export type DesktopUpdateInstallMode = 'in-place' | 'link'

/** Where an in-place install has got to. Reported to the page as it moves. */
export type DesktopUpdateInstallState =
  | { state: 'idle' }
  | { state: 'downloading', percent: number }
  | { state: 'ready', version: string }
  | { state: 'failed', message: string }

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
  /** The Update waiting for an answer, else null — already filtered by what the singer skipped. */
  update: () => Promise<DesktopUpdate | null>
  /** Stops offering this Release, and anything not newer than it, until a newer one appears. */
  skipUpdate: (version: string) => Promise<void>
  /** Looks for an Update now, whatever the switch says and whatever was skipped. */
  checkForUpdateNow: () => Promise<DesktopUpdateCheck>
  /** Whether the shell looks for an Update at launch. */
  automaticUpdateChecks: () => Promise<boolean>
  setAutomaticUpdateChecks: (enabled: boolean) => Promise<void>
  /** Whether this build installs an Update itself or sends the singer to the download page. */
  updateInstallMode: () => Promise<DesktopUpdateInstallMode>
  /** Starts downloading the Update. Nothing is fetched until this is called. */
  installUpdate: () => Promise<void>
  /** Installs what was downloaded and relaunches, stopping the server first. */
  restartToUpdate: () => Promise<void>
  /** Where the install has got to, and the unsubscribe for following it. */
  updateInstallState: () => Promise<DesktopUpdateInstallState>
  onUpdateInstallStateChange: (listener: (state: DesktopUpdateInstallState) => void) => () => void
  openExternal: (url: string) => Promise<void>
  /**
   * The window has no native chrome of its own (`titlebar.ts`), so
   * `TitleBar.vue` draws it and these are the controls that chrome would
   * otherwise have carried.
   */
  isWindowMaximized: () => Promise<boolean>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  /** Keeps the maximize/restore icon in step with a maximize the singer triggered another way — a double-click on the drag strip, a Windows snap. Returns the unsubscribe. */
  onWindowMaximizedChange: (listener: (maximized: boolean) => void) => () => void
}

export const BRIDGE_CHANNELS = {
  libraryDir: 'akapela:library-dir',
  chooseLibraryDir: 'akapela:choose-library-dir',
  revealLibraryDir: 'akapela:reveal-library-dir',
  update: 'akapela:update',
  skipUpdate: 'akapela:skip-update',
  checkForUpdateNow: 'akapela:check-for-update',
  automaticUpdateChecks: 'akapela:automatic-update-checks',
  setAutomaticUpdateChecks: 'akapela:set-automatic-update-checks',
  updateInstallMode: 'akapela:update-install-mode',
  installUpdate: 'akapela:install-update',
  restartToUpdate: 'akapela:restart-to-update',
  updateInstallState: 'akapela:update-install-state',
  updateInstallStateChanged: 'akapela:update-install-state-changed',
  openExternal: 'akapela:open-external',
  isWindowMaximized: 'akapela:window-is-maximized',
  minimizeWindow: 'akapela:window-minimize',
  toggleMaximizeWindow: 'akapela:window-toggle-maximize',
  closeWindow: 'akapela:window-close',
  windowMaximizedChanged: 'akapela:window-maximized-changed',
} as const
