import { describe, expect, it } from 'vitest'
import { detectPlatform, matchInstallers, planDownloads, RELEASE_PAGE } from '../../../site/src/lib/downloads'

const DOWNLOAD = 'https://github.com/kawishbit/akapela/releases/download/v1.2.2'

// The v1.2.2 Release exactly as the GitHub API lists it, update metadata and
// blockmap included — the page has to pick the installers out from among them.
const v122 = {
  tag_name: 'v1.2.2',
  assets: [
    'Akapela-1.2.2-arm64.dmg',
    'Akapela-1.2.2-arm64.dmg.sha256',
    'Akapela-1.2.2.AppImage',
    'Akapela-1.2.2.AppImage.sha256',
    'Akapela.Setup.1.2.2.exe',
    'Akapela.Setup.1.2.2.exe.blockmap',
    'Akapela.Setup.1.2.2.exe.sha256',
    'latest-linux.yml',
    'latest.yml',
  ].map(name => ({ name, browser_download_url: `${DOWNLOAD}/${name}` })),
}

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  it.each([
    ['windows', UA.windows],
    ['mac', UA.mac],
    ['linux', UA.linux],
  ] as const)('recognises %s from its user agent', (platform, userAgent) => {
    expect(detectPlatform({ userAgent })).toBe(platform)
  })

  it('prefers the client hint over the user agent', () => {
    expect(detectPlatform({ userAgent: UA.windows, platform: 'macOS' })).toBe('mac')
  })

  it.each([
    ['Android', { userAgent: UA.android }],
    ['an iPhone', { userAgent: UA.iphone }],
    // iPadOS asks for the desktop site by default and says it is a Mac.
    ['an iPad posing as a Mac', { userAgent: UA.mac, maxTouchPoints: 5 }],
    ['a client hint saying mobile', { userAgent: UA.windows, mobile: true }],
    ['ChromeOS', { userAgent: UA.chromeos }],
    ['an empty user agent', { userAgent: '' }],
  ])('has no desktop platform for %s', (_, client) => {
    expect(detectPlatform(client)).toBeNull()
  })
})

describe('matchInstallers', () => {
  it('picks the three installers and their checksums out of a real Release', () => {
    expect(matchInstallers(v122)).toEqual({
      windows: {
        fileName: 'Akapela.Setup.1.2.2.exe',
        href: `${DOWNLOAD}/Akapela.Setup.1.2.2.exe`,
        sha256Href: `${DOWNLOAD}/Akapela.Setup.1.2.2.exe.sha256`,
      },
      mac: {
        fileName: 'Akapela-1.2.2-arm64.dmg',
        href: `${DOWNLOAD}/Akapela-1.2.2-arm64.dmg`,
        sha256Href: `${DOWNLOAD}/Akapela-1.2.2-arm64.dmg.sha256`,
      },
      linux: {
        fileName: 'Akapela-1.2.2.AppImage',
        href: `${DOWNLOAD}/Akapela-1.2.2.AppImage`,
        sha256Href: `${DOWNLOAD}/Akapela-1.2.2.AppImage.sha256`,
      },
    })
  })

  it('matches the Windows installer by its current name too', () => {
    const name = 'Akapela-Setup-1.3.0.exe'
    const installers = matchInstallers({ assets: [{ name, browser_download_url: `${DOWNLOAD}/${name}` }] })
    expect(installers.windows?.fileName).toBe(name)
  })

  it('leaves out a platform the Release has no installer for', () => {
    const assets = v122.assets.filter(asset => !asset.name.includes('.dmg'))
    const installers = matchInstallers({ assets })
    expect(installers.mac).toBeUndefined()
    expect(installers.windows).toBeDefined()
    expect(installers.linux).toBeDefined()
  })

  it('never offers an Intel DMG as the Apple Silicon one', () => {
    const name = 'Akapela-1.2.2.dmg'
    expect(matchInstallers({ assets: [{ name, browser_download_url: `${DOWNLOAD}/${name}` }] }).mac).toBeUndefined()
  })

  it('offers an installer without a checksum rather than hiding it', () => {
    const assets = v122.assets.filter(asset => asset.name !== 'Akapela-1.2.2.AppImage.sha256')
    expect(matchInstallers({ assets }).linux).toEqual({
      fileName: 'Akapela-1.2.2.AppImage',
      href: `${DOWNLOAD}/Akapela-1.2.2.AppImage`,
    })
  })

  it('ignores links that do not point at this repo\'s Releases', () => {
    const name = 'Akapela-1.2.2.AppImage'
    expect(matchInstallers({ assets: [{ name, browser_download_url: `https://example.com/${name}` }] }).linux).toBeUndefined()
  })
})

describe('planDownloads', () => {
  it('leads with the visitor\'s platform and keeps the others beneath it', () => {
    const plan = planDownloads({ userAgent: UA.mac }, v122)
    expect(plan.primary).toBe('mac')
    expect(plan.order).toEqual(['mac', 'windows', 'linux'])
    expect(plan.version).toBe('1.2.2')
  })

  it('shows all three as equals when the platform is unknown', () => {
    const plan = planDownloads({ userAgent: UA.iphone }, v122)
    expect(plan.primary).toBeNull()
    expect(plan.order).toEqual(['windows', 'mac', 'linux'])
  })

  it('still picks a primary platform when the Release could not be read', () => {
    expect(planDownloads({ userAgent: UA.linux }, null)).toEqual({
      primary: 'linux',
      order: ['linux', 'windows', 'mac'],
      version: null,
      installers: {},
    })
  })

  it.each([
    ['a rate-limit error body', { message: 'API rate limit exceeded' }],
    ['a string', 'nope'],
    ['assets that are not a list', { tag_name: 'v1.2.2', assets: 'x' }],
  ])('treats %s as no Release at all', (_, body) => {
    const plan = planDownloads({ userAgent: UA.windows }, body)
    expect(plan.installers).toEqual({})
    expect(plan.version).toBeNull()
  })

  it('names the Release page every button falls back to', () => {
    expect(RELEASE_PAGE).toBe('https://github.com/kawishbit/akapela/releases/latest')
  })
})
