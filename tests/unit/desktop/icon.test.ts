import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { windowIconOptions } from '../../../desktop/src/icon'

const ICON = join('/opt', 'Akapela', 'resources', 'icon.png')

describe('windowIconOptions', () => {
  it('hands Linux the icon file, which its window and taskbar cannot find on their own', () => {
    expect(windowIconOptions('linux', ICON)).toEqual({ icon: ICON })
  })

  it('leaves Windows and macOS to take it from the executable and the bundle', () => {
    expect(windowIconOptions('win32', ICON)).toEqual({})
    expect(windowIconOptions('darwin', ICON)).toEqual({})
  })
})
