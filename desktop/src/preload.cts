import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AkapelaBridge, DesktopUpdate, LibraryChange } from './bridge.cjs'

/**
 * The preload script, deliberately CommonJS: preload scripts run in a sandbox
 * that has no ESM loader, so this is the one file in `desktop/` that is not an
 * ES module.
 *
 * Context isolation stays on and `nodeIntegration` stays off — the renderer is
 * the same web app a browser loads over http, and giving it Node would be a
 * second, more privileged version of the app to reason about.
 *
 * `sandbox: true` (`main.ts`) is what makes this file import only *types*
 * from `bridge.cts` rather than `BRIDGE_CHANNELS` itself: a sandboxed
 * preload's `require` resolves nothing beyond Electron/Node's own built-ins —
 * not another file sitting right next to it on disk — so `CHANNELS` below is
 * a literal copy, not an import, of `BRIDGE_CHANNELS`. Electron's own docs
 * call this out: a sandboxed preload has to be self-contained or bundled, and
 * bundling is more machinery than a dozen channel names justify.
 * `tests/unit/desktop/preload-channels.test.ts` keeps the two copies honest.
 */
const CHANNELS = {
  libraryDir: 'akapela:library-dir',
  chooseLibraryDir: 'akapela:choose-library-dir',
  revealLibraryDir: 'akapela:reveal-library-dir',
  update: 'akapela:update',
  openExternal: 'akapela:open-external',
  isWindowMaximized: 'akapela:window-is-maximized',
  minimizeWindow: 'akapela:window-minimize',
  toggleMaximizeWindow: 'akapela:window-toggle-maximize',
  closeWindow: 'akapela:window-close',
  windowMaximizedChanged: 'akapela:window-maximized-changed',
} as const

/**
 * The app version, handed over as `additionalArguments` from `main.ts`.
 *
 * A sandboxed preload gets a stripped-down `process` — reading the version off
 * `process.env` works until it does not, and `argv` is the documented way to
 * get a value in here. Everything else the bridge offers goes over IPC, where
 * the main process answers with what it actually knows.
 */
const VERSION_ARGUMENT = '--akapela-version='

function version(): string {
  const argument = process.argv.find(value => value.startsWith(VERSION_ARGUMENT))
  return argument ? argument.slice(VERSION_ARGUMENT.length) : '0.0.0'
}

const bridge: AkapelaBridge = {
  desktop: true,
  version: version(),
  platform: process.platform,
  libraryDir: () => ipcRenderer.invoke(CHANNELS.libraryDir) as Promise<string>,
  chooseLibraryDir: () => ipcRenderer.invoke(CHANNELS.chooseLibraryDir) as Promise<LibraryChange>,
  revealLibraryDir: () => ipcRenderer.invoke(CHANNELS.revealLibraryDir) as Promise<void>,
  update: () => ipcRenderer.invoke(CHANNELS.update) as Promise<DesktopUpdate | null>,
  openExternal: (url: string) => ipcRenderer.invoke(CHANNELS.openExternal, url) as Promise<void>,
  isWindowMaximized: () => ipcRenderer.invoke(CHANNELS.isWindowMaximized) as Promise<boolean>,
  minimizeWindow: () => ipcRenderer.invoke(CHANNELS.minimizeWindow) as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke(CHANNELS.toggleMaximizeWindow) as Promise<void>,
  closeWindow: () => ipcRenderer.invoke(CHANNELS.closeWindow) as Promise<void>,
  onWindowMaximizedChange: (listener) => {
    const handler = (_event: IpcRendererEvent, maximized: boolean) => listener(maximized)
    ipcRenderer.on(CHANNELS.windowMaximizedChanged, handler)
    return () => ipcRenderer.removeListener(CHANNELS.windowMaximizedChanged, handler)
  },
}

contextBridge.exposeInMainWorld('akapela', bridge)
