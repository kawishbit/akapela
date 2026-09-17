import { describe, expect, it } from 'vitest'
import { promptOffers, promptShows, type UpdatePromptState } from '../../app/utils/update-prompt'

const waiting: UpdatePromptState = {
  offer: { version: '1.1.0', url: 'https://example.invalid/1.1.0' },
  answered: false,
}

describe('promptShows', () => {
  it('stays shut when there is no Update', () => {
    expect(promptShows({ offer: null, answered: false }, { pageAllowsPrompt: true })).toBe(false)
  })

  it('opens on a page that allows it once an Update is waiting', () => {
    expect(promptShows(waiting, { pageAllowsPrompt: true })).toBe(true)
  })

  it('waits while the singer is somewhere it would interrupt', () => {
    expect(promptShows(waiting, { pageAllowsPrompt: false })).toBe(false)
  })

  it('opens on the next page that allows it, having waited', () => {
    expect(promptShows(waiting, { pageAllowsPrompt: false })).toBe(false)
    expect(promptShows(waiting, { pageAllowsPrompt: true })).toBe(true)
  })

  it('stays shut once the singer has answered it', () => {
    expect(promptShows({ ...waiting, answered: true }, { pageAllowsPrompt: true })).toBe(false)
  })
})

describe('promptOffers', () => {
  it('offers the download page where the app cannot install for itself', () => {
    expect(promptOffers({ mode: 'link', install: { state: 'idle' } })).toEqual({
      act: 'download-page',
      dismissable: true,
      progress: null,
    })
  })

  it('offers to install where it can', () => {
    expect(promptOffers({ mode: 'in-place', install: { state: 'idle' } })).toEqual({
      act: 'install',
      dismissable: true,
      progress: null,
    })
  })

  it('shows progress while downloading, and cannot be dismissed into nothing', () => {
    expect(promptOffers({ mode: 'in-place', install: { state: 'downloading', percent: 42 } })).toEqual({
      act: 'downloading',
      dismissable: false,
      progress: 42,
    })
  })

  it('offers the restart once the Update is ready', () => {
    expect(promptOffers({ mode: 'in-place', install: { state: 'ready', version: '1.1.0' } })).toEqual({
      act: 'restart',
      dismissable: true,
      progress: 100,
    })
  })

  it('falls back to the download page when installing failed', () => {
    // The same thing macOS always offers: a failure never dead-ends.
    expect(promptOffers({ mode: 'in-place', install: { state: 'failed', message: 'checksum mismatch' } })).toEqual({
      act: 'download-page',
      dismissable: true,
      progress: null,
    })
  })
})
