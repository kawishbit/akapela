import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, isNewerVersion, RELEASES_URL } from '../../../desktop/src/update-check'

function release(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch
}

describe('isNewerVersion', () => {
  it.each([
    ['0.2.0', '0.1.0', true],
    ['v0.2.0', '0.1.0', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['1.0.0', '0.9.9', true],
    ['0.10.0', '0.9.0', true],
    ['0.1.1', '0.1.0', true],
  ])('%s over %s is %p', (candidate, current, expected) => {
    expect(isNewerVersion(candidate, current)).toBe(expected)
  })
})

describe('checkForUpdate', () => {
  it('reports a newer release with a link to it', async () => {
    const fetchImpl = release({ tag_name: 'v0.2.0', html_url: 'https://example.invalid/0.2.0' })

    expect(await checkForUpdate('0.1.0', fetchImpl)).toEqual({
      version: '0.2.0',
      url: 'https://example.invalid/0.2.0',
    })
  })

  it('says nothing when the latest release is what is already running', async () => {
    expect(await checkForUpdate('0.2.0', release({ tag_name: 'v0.2.0' }))).toBeNull()
  })

  it('ignores drafts and prereleases', async () => {
    expect(await checkForUpdate('0.1.0', release({ tag_name: 'v0.2.0', draft: true }))).toBeNull()
    expect(await checkForUpdate('0.1.0', release({ tag_name: 'v0.2.0', prerelease: true }))).toBeNull()
  })

  it('stays quiet when the check itself fails', async () => {
    const offline = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND') }) as unknown as typeof fetch

    // Nobody is blocked on this answer, so a machine with no network gets
    // silence rather than an error in front of the singer.
    expect(await checkForUpdate('0.1.0', offline)).toBeNull()
    expect(await checkForUpdate('0.1.0', release({}, 503))).toBeNull()
  })

  it('falls back to the releases page when a release carries no link of its own', async () => {
    expect(await checkForUpdate('0.1.0', release({ tag_name: 'v0.2.0' }))).toEqual({
      version: '0.2.0',
      url: RELEASES_URL,
    })
  })
})
