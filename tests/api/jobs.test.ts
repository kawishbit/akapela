import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

describe('jobs', () => {
  test('an enqueued no-op job is retrievable as queued', async () => {
    const created = await api.post('/api/jobs', { type: 'noop' })
    expect(created.status).toBe(201)
    const job = await created.json()

    const fetched = await api.get(`/api/jobs/${job.id}`)
    expect(fetched.status).toBe(200)
    expect(await fetched.json()).toMatchObject({
      id: job.id,
      type: 'noop',
      state: 'queued',
      progress: 0,
      error: null,
    })
  })

  test('an unknown job type is rejected', async () => {
    const res = await api.post('/api/jobs', { type: 'teleport' })
    expect(res.status).toBe(400)
  })

  test('an unknown job id is a 404', async () => {
    const res = await api.get('/api/jobs/does-not-exist')
    expect(res.status).toBe(404)
  })

  test('a job finished by the worker is reported with its final state', async () => {
    const created = await api.post('/api/jobs', { type: 'noop' })
    const job = await created.json()

    api.finishJob(job.id, 'succeeded')

    const fetched = await api.get(`/api/jobs/${job.id}`)
    expect(await fetched.json()).toMatchObject({ state: 'succeeded', progress: 100 })
  })
})
