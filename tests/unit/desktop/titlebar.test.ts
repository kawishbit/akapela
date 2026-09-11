import { describe, expect, it } from 'vitest'
import { MAC_TRAFFIC_LIGHT_POSITION, titleBarWindowOptions } from '../../../desktop/src/titlebar'

describe('titleBarWindowOptions', () => {
  it('insets the native traffic lights into the content on macOS rather than removing the frame', () => {
    expect(titleBarWindowOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION,
    })
  })

  it('removes the frame entirely on Windows and Linux, for TitleBar.vue to replace', () => {
    expect(titleBarWindowOptions('win32')).toEqual({ frame: false })
    expect(titleBarWindowOptions('linux')).toEqual({ frame: false })
  })
})
