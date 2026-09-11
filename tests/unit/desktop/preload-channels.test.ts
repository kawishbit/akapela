import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `preload.cts` cannot `import { BRIDGE_CHANNELS } from './bridge.cjs'` —
 * a sandboxed preload's `require` resolves nothing beyond Electron/Node's
 * own built-ins, not a sibling file — so it carries a literal copy instead
 * (see the comment on `CHANNELS` there). Comparing the two as text is what
 * actually exercises the copy that ships, without needing to load either
 * file as a module — `bridge.cts` has no runtime dependency on Electron,
 * but `.cts` isn't one of Vite's recognised extensions, and `preload.cts`
 * calls `contextBridge.exposeInMainWorld` at import time, which only exists
 * inside Electron.
 */
function akapelaChannelLiterals(path: string): string[] {
  const source = readFileSync(path, 'utf-8')
  return [...source.matchAll(/'akapela:[a-z-]+'/g)].map(match => match[0]).sort()
}

describe('preload.cts channel copy', () => {
  it('carries exactly the channel names BRIDGE_CHANNELS does', () => {
    const desktopSrc = join(__dirname, '../../../desktop/src')
    expect(akapelaChannelLiterals(join(desktopSrc, 'preload.cts')))
      .toEqual(akapelaChannelLiterals(join(desktopSrc, 'bridge.cts')))
  })
})
