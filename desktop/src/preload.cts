import { contextBridge, ipcRenderer } from 'electron'
import { BRIDGE_CHANNELS, type AkapelaBridge, type DesktopUpdate, type LibraryChange } from './bridge.cjs'

/**
 * The preload script, deliberately CommonJS: preload scripts run in a sandbox
 * that has no ESM loader, so this is the one file in `desktop/` that is not an
 * ES module.
 *
 * Context isolation stays on and `nodeIntegration` stays off — the renderer is
 * the same web app a browser loads over http, and giving it Node would be a
 * second, more privileged version of the app to reason about.
 */

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
  libraryDir: () => ipcRenderer.invoke(BRIDGE_CHANNELS.libraryDir) as Promise<string>,
  chooseLibraryDir: () => ipcRenderer.invoke(BRIDGE_CHANNELS.chooseLibraryDir) as Promise<LibraryChange>,
  revealLibraryDir: () => ipcRenderer.invoke(BRIDGE_CHANNELS.revealLibraryDir) as Promise<void>,
  update: () => ipcRenderer.invoke(BRIDGE_CHANNELS.update) as Promise<DesktopUpdate | null>,
  openExternal: (url: string) => ipcRenderer.invoke(BRIDGE_CHANNELS.openExternal, url) as Promise<void>,
}

contextBridge.exposeInMainWorld('akapela', bridge)
