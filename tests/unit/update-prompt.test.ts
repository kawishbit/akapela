import { describe, expect, it } from 'vitest'
import { promptShows, type UpdatePromptState } from '../../app/utils/update-prompt'

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
