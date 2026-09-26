// Which installer a visitor gets, and where it lives. Plain data in and out,
// with no DOM or network in it, so the root vitest suite covers it the way
// `tests/unit/desktop/` covers the shell (tests/unit/site/downloads.test.ts).
// The page feeds it `navigator` and the body of GitHub's latest-Release call.

export type Platform = 'windows' | 'mac' | 'linux'

export const REPO = 'https://github.com/kawishbit/akapela'

/** Every button's link before, and whenever, the Release can't be read. */
export const RELEASE_PAGE = `${REPO}/releases/latest`

/** Asked from the browser: CORS-enabled, 60 unauthenticated calls an hour per visitor IP. */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/kawishbit/akapela/releases/latest'

const DOWNLOAD_PREFIX = `${REPO}/releases/download/`

const PLATFORMS: readonly Platform[] = ['windows', 'mac', 'linux']

export function isPlatform(value: unknown): value is Platform {
  return PLATFORMS.includes(value as Platform)
}

/**
 * What the release workflow uploads for each platform. Checksums, update
 * metadata (`latest*.yml`), and blockmaps never match: none of them end in an
 * installer's extension. macOS is Apple Silicon only — an unsuffixed `.dmg`
 * would be Intel, and there is no Intel build to offer.
 */
const INSTALLER_SUFFIX: Record<Platform, string> = {
  windows: '.exe',
  mac: '-arm64.dmg',
  linux: '.AppImage',
}

export interface Client {
  userAgent: string
  /** `navigator.userAgentData.platform` where the browser has it, else `navigator.platform`. */
  platform?: string
  /** `navigator.userAgentData.mobile`. */
  mobile?: boolean
  maxTouchPoints?: number
}

export interface Installer {
  fileName: string
  href: string
  sha256Href?: string
}

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface Downloads {
  /** The visitor's own platform, or null on a phone, a tablet, or anything unrecognised. */
  primary: Platform | null
  /** The primary first, then the rest in their usual order. */
  order: Platform[]
  /** The Release's version without its `v`, or null when it could not be read. */
  version: string | null
  /** Only the platforms the Release has an installer for; the rest keep RELEASE_PAGE. */
  installers: Partial<Record<Platform, Installer>>
}

/**
 * The desktop platform a visitor is on, or null when there is no installer
 * that would run there. A browser cannot reliably tell Apple Silicon from
 * Intel, so a Mac is simply a Mac; the page labels it Apple Silicon.
 */
export function detectPlatform(client: Client): Platform | null {
  const ua = client.userAgent
  if (client.mobile || /Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(ua)) return null

  const platform = platformNamedIn(client.platform ?? '') ?? platformNamedIn(ua)
  // iPadOS asks for the desktop site and reports itself as a Mac; its touch
  // points give it away.
  if (platform === 'mac' && (client.maxTouchPoints ?? 0) > 1) return null
  return platform
}

function platformNamedIn(text: string): Platform | null {
  if (/Mac/i.test(text)) return 'mac'
  if (/Win/i.test(text)) return 'windows'
  if (/Linux|X11/i.test(text)) return 'linux'
  return null
}

/** Each platform's installer in a Release's assets, with its `.sha256` sibling when there is one. */
export function matchInstallers(release: { assets: readonly ReleaseAsset[] }): Partial<Record<Platform, Installer>> {
  const assets = release.assets.filter(asset => asset.browser_download_url.startsWith(DOWNLOAD_PREFIX))
  const installers: Partial<Record<Platform, Installer>> = {}
  for (const platform of PLATFORMS) {
    const installer = assets.find(asset => asset.name.endsWith(INSTALLER_SUFFIX[platform]))
    if (!installer) continue
    const checksum = assets.find(asset => asset.name === `${installer.name}.sha256`)
    installers[platform] = {
      fileName: installer.name,
      href: installer.browser_download_url,
      ...(checksum && { sha256Href: checksum.browser_download_url }),
    }
  }
  return installers
}

/**
 * Everything the download buttons need, from the visitor and whatever the
 * latest-Release call returned — which may be null (the call failed) or an
 * error body (rate-limited), and either way leaves every button on RELEASE_PAGE.
 */
export function planDownloads(client: Client, release: unknown): Downloads {
  const primary = detectPlatform(client)
  const order = primary ? [primary, ...PLATFORMS.filter(platform => platform !== primary)] : [...PLATFORMS]
  if (!isRelease(release)) return { primary, order, version: null, installers: {} }
  return {
    primary,
    order,
    version: release.tag_name.replace(/^v/, ''),
    installers: matchInstallers(release),
  }
}

function isRelease(value: unknown): value is { tag_name: string, assets: ReleaseAsset[] } {
  if (typeof value !== 'object' || value === null) return false
  const { tag_name: tag, assets } = value as Record<string, unknown>
  return typeof tag === 'string'
    && Array.isArray(assets)
    && assets.every(asset => typeof asset === 'object' && asset !== null
      && typeof (asset as ReleaseAsset).name === 'string'
      && typeof (asset as ReleaseAsset).browser_download_url === 'string')
}
