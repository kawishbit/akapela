import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Bounds } from './bounds.js'

/**
 * The handful of things the shell itself remembers, in one JSON file beside
 * the app's own data: the window's last bounds, the loopback port (see
 * `port.ts` for why that has to be stable), and which library folder is open.
 *
 * Deliberately not `electron-store`: this is three fields and a file, and
 * keeping it Electron-free is what lets the root vitest suite cover the parts
 * that are easy to get wrong — a config file someone hand-edited into
 * nonsense, and a first run with no file at all.
 */

export interface DesktopConfig {
  bounds?: Partial<Bounds>
  port?: number
  /** Absolute path to the data directory; unset means the default under `userData`. */
  libraryDir?: string
}

export const CONFIG_FILENAME = 'desktop.json'

/** Where the config lives inside Electron's `userData` directory. */
export function configPath(userDataDir: string): string {
  return join(userDataDir, CONFIG_FILENAME)
}

export class ConfigStore {
  private cache: DesktopConfig | undefined

  constructor(private readonly file: string) {}

  /**
   * What is on disk. A missing, unreadable, or corrupt file reads as an empty
   * config rather than throwing — losing the window position is a far better
   * outcome than an app that will not open.
   */
  read(): DesktopConfig {
    if (this.cache) return this.cache
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.file, 'utf8'))
    }
    catch {
      parsed = undefined
    }
    this.cache = isConfig(parsed) ? parsed : {}
    return this.cache
  }

  /** Merges `patch` into the config and writes it. */
  update(patch: DesktopConfig): DesktopConfig {
    const next = { ...this.read(), ...patch }
    this.cache = next
    mkdirSync(dirname(this.file), { recursive: true })
    // Same rename-into-place every other write in this codebase uses, so an
    // app killed mid-write leaves the previous config rather than half a file.
    const tmp = `${this.file}.part`
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`)
    renameSync(tmp, this.file)
    return next
  }
}

function isConfig(value: unknown): value is DesktopConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
