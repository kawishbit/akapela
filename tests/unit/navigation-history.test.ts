import { describe, expect, it } from 'vitest'
import {
  canGoBack,
  canGoForward,
  currentPath,
  goBack,
  goForward,
  initialNavigationHistory,
  pushNavigationEntry,
} from '../../app/utils/navigation-history'

describe('initialNavigationHistory', () => {
  it('starts as a single entry with nowhere to go either way', () => {
    const state = initialNavigationHistory('/')
    expect(currentPath(state)).toBe('/')
    expect(canGoBack(state)).toBe(false)
    expect(canGoForward(state)).toBe(false)
  })
})

describe('pushNavigationEntry', () => {
  it('appends a new path and makes it current', () => {
    const state = pushNavigationEntry(initialNavigationHistory('/'), '/tracks/1')
    expect(currentPath(state)).toBe('/tracks/1')
    expect(canGoBack(state)).toBe(true)
  })

  it('is a no-op for the path already current, so reloading a page does not pad the stack', () => {
    const state = initialNavigationHistory('/tracks/1')
    expect(pushNavigationEntry(state, '/tracks/1')).toBe(state)
  })

  it('drops any entries ahead of here, the way a browser does after Back then a new link', () => {
    let state = initialNavigationHistory('/')
    state = pushNavigationEntry(state, '/tracks/1')
    state = pushNavigationEntry(state, '/tracks/1/sing')
    state = goBack(state)
    expect(currentPath(state)).toBe('/tracks/1')

    state = pushNavigationEntry(state, '/tracks/2')
    expect(currentPath(state)).toBe('/tracks/2')
    expect(canGoForward(state)).toBe(false)
  })
})

describe('goBack and goForward', () => {
  it('move the pointer without touching the stack', () => {
    let state = initialNavigationHistory('/')
    state = pushNavigationEntry(state, '/tracks/1')
    state = pushNavigationEntry(state, '/tracks/1/sing')

    state = goBack(state)
    expect(currentPath(state)).toBe('/tracks/1')
    expect(canGoBack(state)).toBe(true)
    expect(canGoForward(state)).toBe(true)

    state = goBack(state)
    expect(currentPath(state)).toBe('/')
    expect(canGoBack(state)).toBe(false)

    state = goForward(state)
    state = goForward(state)
    expect(currentPath(state)).toBe('/tracks/1/sing')
    expect(canGoForward(state)).toBe(false)
  })

  it('refuse to move past either end of the stack', () => {
    const state = initialNavigationHistory('/')
    expect(goBack(state)).toBe(state)
    expect(goForward(state)).toBe(state)
  })
})
