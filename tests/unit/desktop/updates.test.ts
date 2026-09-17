import { describe, expect, it } from 'vitest'
import { offeredUpdate } from '../../../desktop/src/update-check'

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
