import electronUpdater, { type AppUpdater } from 'electron-updater'
import type { DesktopUpdate, DesktopUpdateInstallState } from './bridge.cjs'

/**
 * Installing an Update, on the platforms that can (ADR 0009's amendment on
 * Updates): Windows, and Linux when the app is running as an AppImage.
 *
 * Everything that decides *whether* to be here is in `update-check.ts`, tested
 * by the root vitest suite — `updateInstallMode` picks the platform's path and
 * `checkLatestRelease` is still the only thing that decides an Update exists.
 * This file is the part that cannot be tested without a real installer and a
 * real Release, so it is kept as small as that allows: download when asked,
 * report where it got to, and hand every failure back as the download link.
 *
 * Nothing here runs on macOS. Squirrel.Mac will not apply an update to an
 * unsigned app, and the build has no Apple Developer account behind it.
 */

/**
 * electron-updater is CommonJS and defines `autoUpdater` behind an arrow-function
 * getter, which Node's named-export detection cannot see through — an
 * `import { autoUpdater }` from this ESM shell links to nothing and the main
 * process dies at launch, on every platform, before a window exists. Reaching
 * through the default export is the way in that works.
 *
 * It stays a function because the getter constructs the platform's updater the
 * first time it is read, and `wire()` is where that is meant to happen.
 */
function autoUpdater(): AppUpdater {
  return electronUpdater.autoUpdater
}

export interface UpdateInstallerOptions {
  /** The Update the launch check found, which is what an install is expected to fetch. */
  expected: () => DesktopUpdate | null
  /** Told every time the install moves on, so the prompt can follow it. */
  onState: (state: DesktopUpdateInstallState) => void
  /** Appends a line to the shell's log file. */
  log: (line: string) => void
}

export class UpdateInstaller {
  private state: DesktopUpdateInstallState = { state: 'idle' }
  private wired = false

  constructor(private readonly options: UpdateInstallerOptions) {}

  current(): DesktopUpdateInstallState {
    return this.state
  }

  /**
   * Downloads the Update. Nothing is fetched before the singer asks for it:
   * an installer is well over a hundred megabytes.
   */
  async download(): Promise<void> {
    if (this.state.state === 'downloading' || this.state.state === 'ready') return
    this.wire()
    this.moveTo({ state: 'downloading', percent: 0 })
    try {
      const found = await autoUpdater().checkForUpdates()
      if (!found) throw new Error('electron-updater found no update metadata on the latest release')

      // `checkLatestRelease` already decided what is on offer; if the metadata
      // names something else, the Release is probably still uploading its
      // assets, and installing whatever this happens to be is not what the
      // singer agreed to.
      const expected = this.options.expected()
      const offered = found.updateInfo.version
      if (expected && offered !== expected.version) {
        throw new Error(`the latest release now offers ${offered}, not the ${expected.version} that was offered`)
      }

      await autoUpdater().downloadUpdate(found.cancellationToken)
    }
    catch (error) {
      this.failed(error)
    }
  }

  /**
   * Installs and relaunches. The server is stopped first rather than left to
   * the installer: it is a real child process holding the database, and the
   * NSIS installer would otherwise be replacing files underneath it.
   */
  async restart(stopServer: () => Promise<void>): Promise<void> {
    if (this.state.state !== 'ready') return
    try {
      await stopServer()
      // Silent, and relaunch afterwards: the singer asked for a restart, so
      // there is nothing left to ask them.
      autoUpdater().quitAndInstall(true, true)
    }
    catch (error) {
      this.failed(error)
    }
  }

  /** Wired on first use, so nothing touches electron-updater on a platform that only links. */
  private wire(): void {
    if (this.wired) return
    this.wired = true

    const updater = autoUpdater()
    updater.autoDownload = false
    // What "Install when I quit" rides on: the downloaded installer runs as
    // the app exits, through the same quit path that stops the server.
    updater.autoInstallOnAppQuit = true
    updater.logger = {
      info: line => this.options.log(`[updater] ${String(line)}`),
      warn: line => this.options.log(`[updater] ${String(line)}`),
      error: line => this.options.log(`[updater] ${String(line)}`),
      debug: () => {},
    }

    updater.on('download-progress', (progress: { percent?: number }) => {
      this.moveTo({ state: 'downloading', percent: Math.round(progress.percent ?? 0) })
    })
    updater.on('update-downloaded', (info: { version?: string }) => {
      this.moveTo({ state: 'ready', version: info.version ?? this.options.expected()?.version ?? '' })
    })
    updater.on('error', error => this.failed(error))
  }

  private failed(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.options.log(`[updater] failed: ${message}`)
    this.moveTo({ state: 'failed', message })
  }

  private moveTo(state: DesktopUpdateInstallState): void {
    this.state = state
    this.options.onState(state)
  }
}
