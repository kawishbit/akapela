/**
 * The native chrome asked for per platform, so the window carries Akapela's
 * own title bar instead of the OS default — the way Spotify's does.
 *
 * On Windows and Linux the frame is gone entirely; `TitleBar.vue` draws the
 * whole strip, including minimize/maximize/close, because neither platform
 * has an "integrated" mode to ask Electron for instead. macOS does: the
 * native traffic lights stay — removing them is a fight nobody wins — just
 * inset into the content rather than sitting above it in their own strip,
 * with `TitleBar.vue` drawing only the draggable space around them.
 *
 * A plain function over `process.platform`, so the platform switch is
 * covered by the root vitest suite rather than by opening a window on every
 * OS `main.ts` runs on.
 */

export interface TitleBarWindowOptions {
  frame?: boolean
  titleBarStyle?: 'hiddenInset'
  trafficLightPosition?: { x: number, y: number }
}

/**
 * Where the traffic lights land inside the strip `TitleBar.vue` draws.
 * Centred on a 38px-tall strip, which is the height that component uses.
 */
export const MAC_TRAFFIC_LIGHT_POSITION = { x: 16, y: 13 }

export function titleBarWindowOptions(platform: NodeJS.Platform): TitleBarWindowOptions {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION }
  }
  return { frame: false }
}
