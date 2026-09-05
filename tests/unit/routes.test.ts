import { describe, expect, test } from 'vitest'
import { isWorthTracing, routeTemplate } from '../../server/lib/routes'

describe('routeTemplate', () => {
  test('a static path is its own template', () => {
    expect(routeTemplate('/api/tracks')).toBe('/api/tracks')
  })

  test('a uuid segment becomes :id, so one span name covers every Track', () => {
    expect(routeTemplate('/api/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44'))
      .toBe('/api/tracks/:id')
  })

  test('every id in a nested path is replaced', () => {
    const path = '/api/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44'
      + '/takes/7d1e0b92-3c45-4a8f-b6e2-0f9a1c7d5e33'
      + '/mixes/c4b7a610-8e29-4d3b-95f1-6a2c0e8b4d17/audio'
    expect(routeTemplate(path)).toBe('/api/tracks/:id/takes/:id/mixes/:id/audio')
  })

  test('a query string is dropped, because it is not part of the route', () => {
    expect(routeTemplate('/api/tracks?q=abbey')).toBe('/api/tracks')
  })

  test('a trailing slash does not make a second template', () => {
    expect(routeTemplate('/api/tracks/')).toBe('/api/tracks')
  })

  test('the root path stays the root path', () => {
    expect(routeTemplate('/')).toBe('/')
  })

  test('a word that merely looks long is left alone', () => {
    expect(routeTemplate('/api/settings')).toBe('/api/settings')
    expect(routeTemplate('/api/tracks/lyrics-offset')).toBe('/api/tracks/lyrics-offset')
  })
})

describe('isWorthTracing', () => {
  test('an API route is what the whole thing is for', () => {
    expect(isWorthTracing('/api/tracks')).toBe(true)
    expect(isWorthTracing('/api/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44/takes')).toBe(true)
  })

  test('a page a singer navigates to is worth a span', () => {
    expect(isWorthTracing('/')).toBe(true)
    expect(isWorthTracing('/tracks/2f8a9c34-1b6d-4e51-9a70-5c3e8d1f2b44/sing')).toBe(true)
  })

  test("the dev server's own traffic is not, or one page load buries every API call", () => {
    expect(isWorthTracing('/_nuxt/app/pages/index.vue')).toBe(false)
    expect(isWorthTracing('/__nuxt_devtools__/client')).toBe(false)
    expect(isWorthTracing('/@vite/client')).toBe(false)
    expect(isWorthTracing('/@fs/E:/repositories/akapela/app/app.vue')).toBe(false)
    expect(isWorthTracing('/@id/virtual:nuxt:something')).toBe(false)
  })

  test('static files the browser asks for on its own are not', () => {
    expect(isWorthTracing('/favicon.ico')).toBe(false)
    expect(isWorthTracing('/icons/icon-192.png')).toBe(false)
    expect(isWorthTracing('/sw.js')).toBe(false)
    expect(isWorthTracing('/manifest.webmanifest')).toBe(false)
  })

  test('the browser log relay is not, or reporting an error would report itself', () => {
    expect(isWorthTracing('/api/telemetry/browser')).toBe(false)
  })
})
