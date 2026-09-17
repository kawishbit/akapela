import { describe, expect, it, vi } from 'vitest'
import { automaticChecks, checkLatestRelease, offeredUpdate, updateInstallMode } from '../../../desktop/src/update-check'

const found = { version: '1.1.0', url: 'https://example.invalid/1.1.0' }

describe('offeredUpdate', () => {
  it('offers what the check found when nothing is skipped', () => {
    expect(offeredUpdate(found, undefined)).toEqual(found)
  })

  it('offers nothing when the check found nothing', () => {
    expect(offeredUpdate(null, undefined)).toBeNull()
  })

  it('stays quiet about the Release the singer skipped', () => {
    expect(offeredUpdate(found, '1.1.0')).toBeNull()
  })

  it('offers a Release newer than the skipped one', () => {
    expect(offeredUpdate(found, '1.0.5')).toEqual(found)
  })

  it('treats a skip of something newer as covering this one too', () => {
    // Only reachable by editing the config by hand or downgrading the app;
    // offering an Update older than one already refused would be noise.
    expect(offeredUpdate(found, '2.0.0')).toBeNull()
  })

  it.each([
    ['a number', 7],
    ['nonsense', 'not-a-version'],
    ['empty', ''],
    ['null', null],
  ])('treats %s in the config as nothing skipped', (_label, skipped) => {
    expect(offeredUpdate(found, skipped as never)).toEqual(found)
  })
})

function release(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch
}

describe('checkLatestRelease', () => {
  it('reports the Update it found', async () => {
    const found = await checkLatestRelease('1.0.0', release({ tag_name: 'v1.1.0', html_url: 'https://example.invalid/1.1.0' }))

    expect(found).toEqual({ state: 'available', update: { version: '1.1.0', url: 'https://example.invalid/1.1.0' } })
  })

  it('says the app is up to date rather than just saying nothing', async () => {
    // What separates "Check now" from the launch check: the singer asked, so
    // "you are on the latest" and "I could not tell" cannot look the same.
    expect(await checkLatestRelease('1.1.0', release({ tag_name: 'v1.1.0' }))).toEqual({ state: 'current' })
  })

  it('reports a failed check as failed', async () => {
    const offline = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND') }) as unknown as typeof fetch

    expect(await checkLatestRelease('1.0.0', offline)).toEqual({ state: 'failed' })
    expect(await checkLatestRelease('1.0.0', release({}, 503))).toEqual({ state: 'failed' })
  })

  it('treats a draft or prerelease as nothing newer, not as a failure', async () => {
    expect(await checkLatestRelease('1.0.0', release({ tag_name: 'v1.1.0', draft: true }))).toEqual({ state: 'current' })
    expect(await checkLatestRelease('1.0.0', release({ tag_name: 'v1.1.0', prerelease: true }))).toEqual({ state: 'current' })
  })
})

describe('automaticChecks', () => {
  it('checks on its own until the singer says otherwise', () => {
    expect(automaticChecks({})).toBe(true)
  })

  it('is off once the singer turns it off', () => {
    expect(automaticChecks({ automaticUpdateChecks: false })).toBe(false)
    expect(automaticChecks({ automaticUpdateChecks: true })).toBe(true)
  })

  it('falls back to checking when the stored value is nonsense', () => {
    expect(automaticChecks({ automaticUpdateChecks: 'yes' as never })).toBe(true)
  })
})

describe('updateInstallMode', () => {
  const packaged = { packaged: true, attached: false, appImage: undefined }

  it('installs in place on Windows', () => {
    expect(updateInstallMode('win32', packaged)).toBe('in-place')
  })

  it('installs in place for a launched AppImage', () => {
    expect(updateInstallMode('linux', { ...packaged, appImage: '/home/singer/Akapela.AppImage' })).toBe('in-place')
  })

  it('only links for a Linux build that was not launched as an AppImage', () => {
    // Extracted, or run from an unpacked directory: there is no single file to
    // replace, so electron-updater has nothing to install into.
    expect(updateInstallMode('linux', packaged)).toBe('link')
  })

  it('only links on macOS, which will not update an unsigned app', () => {
    expect(updateInstallMode('darwin', packaged)).toBe('link')
  })

  it('only links when the app is not packaged', () => {
    expect(updateInstallMode('win32', { ...packaged, packaged: false })).toBe('link')
  })

  it('only links when the window is attached to a dev server someone else is running', () => {
    expect(updateInstallMode('win32', { ...packaged, attached: true })).toBe('link')
  })
})
