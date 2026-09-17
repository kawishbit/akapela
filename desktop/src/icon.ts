/**
 * Whether the window has to be handed Akapela's icon, per platform.
 *
 * Windows takes a window's icon from the executable and macOS takes it from
 * the bundle, so on both of those the packaged icon is already the window's
 * icon and passing one again changes nothing. Linux is the exception: an
 * AppImage's window and its taskbar entry fall back to Electron's default
 * unless the window is given the file directly, because matching a window back
 * to its `.desktop` entry is unreliable.
 *
 * A plain function over `process.platform`, so the platform switch is covered
 * by the root vitest suite rather than by opening a window on every OS
 * `main.ts` runs on — the same shape as `titlebar.ts`.
 */

export interface WindowIconOptions {
  icon?: string
}

export function windowIconOptions(platform: NodeJS.Platform, iconPath: string): WindowIconOptions {
  return platform === 'linux' ? { icon: iconPath } : {}
}
