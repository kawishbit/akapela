import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

/**
 * Deliberately does not test a *successful, confirmed* restore through the
 * HTTP route: `restore.post.ts` calls `process.exit()` shortly after
 * responding, by design (see its own comment and `server/lib/backup.ts`) —
 * doing that from inside this process would kill the whole test run, not
 * just this test. The real restore logic (does the data actually come
 * back) is exercised directly, without the HTTP layer or the exit, in
 * `tests/unit/backup.test.ts`. What's tested here is everything the route
 * decides before it would ever reach that point.
 */
describe('backup', () => {
  test('downloads a gzip archive', async () => {
    const res = await api.get('/api/backup')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/gzip')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="akapela-backup-.*\.tar\.gz"/)

    const bytes = new Uint8Array(await res.arrayBuffer())
    // gzip magic number.
    expect(bytes[0]).toBe(0x1f)
    expect(bytes[1]).toBe(0x8b)
  })

  test('restoring with no file is rejected', async () => {
    const form = new FormData()
    const res = await fetch(`${api.baseUrl}/api/backup/restore`, { method: 'POST', body: form })
    expect(res.status).toBe(400)
  })

  test('restoring over an existing library without confirming is refused', async () => {
    await api.post('/api/tracks', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    const backup = new Uint8Array(await (await api.get('/api/backup')).arrayBuffer())

    const res = await api.uploadRestore(backup, { confirm: false })

    expect(res.status).toBe(409)
  })

  test('restoring an invalid file fails validation before anything is touched', async () => {
    // The library is empty, so this reaches stageRestore's own validation
    // rather than the confirmation gate — proving the file-content check
    // works independently of it.
    const res = await api.uploadRestore(new TextEncoder().encode('not a backup archive'), { confirm: true })

    expect(res.status).toBe(400)
  })
})
