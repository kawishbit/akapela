import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

test('says it is an Akapela, and which Release, so a Desktop App can tell before connecting', async () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

  const res = await api.get('/api/version')

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ app: 'akapela', version })
})
