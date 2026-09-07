import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createTestApi, type TestApi } from './harness'

let api: TestApi

beforeEach(async () => {
  api = await createTestApi()
})

afterEach(async () => {
  await api.close()
})

/** A Track whose import has finished, which is the only kind that can be separated. */
async function importedTrack() {
  const track = await (await api.post('/api/tracks', { url: 'https://youtu.be/dQw4w9WgXcQ' })).json()
  api.finishImport(track.id, track.job.id)
  return track
}

/**
 * A Track whose separation has succeeded, left as the worker leaves one: both
 * audio files on disk beside each other, and the Track singing over the Stem.
 * The contents stand in for audio, since the app only ever streams these bytes.
 */
async function separatedTrack() {
  const track = await importedTrack()
  const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
  writeTrackFile(track.id, 'backing.wav', 'the original')
  writeTrackFile(track.id, 'instrumental.wav', 'the instrumental')
  writeTrackFile(track.id, 'vocals.wav', 'the vocals')
  api.finishSeparation(track.id, separationJob.id, 'succeeded')
  return track
}

function writeTrackFile(trackId: string, name: string, contents: string) {
  writeFileSync(join(api.dataDir, 'tracks', trackId, name), contents)
}

describe('which Backing Source a Track is on', () => {
  test('a Track sings over its original audio until it has been separated', async () => {
    const track = await importedTrack()

    expect(track.backingSource).toBe('original')
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('original')
    expect((await (await api.get('/api/tracks')).json())[0].backingSource).toBe('original')
  })

  test('a succeeded separation flips it to the Instrumental Stem, so the common case takes no tap', async () => {
    const track = await separatedTrack()

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('instrumental')
  })

  test('a failed separation leaves the Track on the audio it was already singing over', async () => {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    api.finishSeparation(track.id, separationJob.id, 'failed', 'SeparationError: no network')

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('original')
  })
})

describe('switching Backing Source', () => {
  test('switching back to the original audio persists on the Track', async () => {
    const track = await separatedTrack()

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    expect(res.status).toBe(200)
    expect((await res.json()).backingSource).toBe('original')

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('original')
  })

  test('and switching to the Instrumental Stem again persists too', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'instrumental' })
    expect(res.status).toBe(200)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('instrumental')
  })

  test('the Instrumental Stem is refused on a Track with no Stems, saying to separate it first', async () => {
    const track = await importedTrack()

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'instrumental' })
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/separate it first/i)

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('original')
  })

  test('a Track still separating for the first time has no Stems yet either', async () => {
    const track = await importedTrack()
    await api.post(`/api/tracks/${track.id}/separate`, {})

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'instrumental' })
    expect(res.status).toBe(409)
  })

  test('a re-separation does not take away the Stems the Track already has', async () => {
    // The worker keeps the existing Stems until a new run has produced
    // replacements, so a Track that already has them can still be switched
    // either way while that run goes and after it fails — including one that
    // had been switched back, which its `separation_state` alone cannot tell
    // apart from a Track being separated for the first time.
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    const again = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()

    const separating = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'instrumental' })
    expect(separating.status).toBe(200)

    api.finishSeparation(track.id, again.separationJob.id, 'failed', 'SeparationError: the model refused this audio')
    const failed = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    expect(failed.status).toBe(200)
    expect((await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'instrumental' })).status).toBe(200)
  })

  test('the original audio is always available, even on a Track nobody has separated', async () => {
    const track = await importedTrack()

    expect((await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })).status).toBe(200)
  })

  test('anything that is not a Backing Source is a 400', async () => {
    const track = await separatedTrack()

    for (const backingSource of ['vocals', '', null, 3]) {
      const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource })
      expect(res.status).toBe(400)
      expect(res.statusText).toMatch(/original/i)
    }
    expect((await api.put(`/api/tracks/${track.id}/backing-source`, {})).status).toBe(400)
  })

  test('an unknown Track is a 404', async () => {
    const res = await api.put('/api/tracks/does-not-exist/backing-source', { backingSource: 'original' })
    expect(res.status).toBe(404)
  })
})

describe('whether there is a Backing Source to choose at all', () => {
  test('a Track with an Instrumental Stem on disk says so', async () => {
    const track = await separatedTrack()

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).hasStems).toBe(true)
  })

  test('a Track nobody has separated does not', async () => {
    const track = await importedTrack()

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).hasStems).toBe(false)
  })

  test('nor does one whose first separation is still running', async () => {
    const track = await importedTrack()
    await api.post(`/api/tracks/${track.id}/separate`, {})

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).hasStems).toBe(false)
  })

  test('but one being separated a second time still has the Stems of the first', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    await api.post(`/api/tracks/${track.id}/separate`, {})

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).hasStems).toBe(true)
  })
})

describe('what the Backing Track stream serves', () => {
  test('the file the Track’s Backing Source names', async () => {
    const track = await separatedTrack()

    expect(await (await api.get(`/api/tracks/${track.id}/backing`)).text()).toBe('the instrumental')

    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    expect(await (await api.get(`/api/tracks/${track.id}/backing`)).text()).toBe('the original')
  })

  test('an explicit source overrides the Track’s own, so the other one can be auditioned', async () => {
    const track = await separatedTrack()

    expect(await (await api.get(`/api/tracks/${track.id}/backing?source=original`)).text()).toBe('the original')
    expect(await (await api.get(`/api/tracks/${track.id}/backing?source=instrumental`)).text()).toBe('the instrumental')
    // Auditioning does not change what the Track sings over next time.
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('instrumental')
  })

  test('the Vocals Stem is not a Backing Source, so it cannot be asked for', async () => {
    const track = await separatedTrack()

    const res = await api.get(`/api/tracks/${track.id}/backing?source=vocals`)
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/original/i)
  })

  test('a Stem that is not on disk is a 404 rather than the wrong audio', async () => {
    const track = await separatedTrack()
    rmSync(join(api.dataDir, 'tracks', track.id, 'instrumental.wav'))

    expect((await api.get(`/api/tracks/${track.id}/backing`)).status).toBe(404)
  })

  test('range requests work on whichever source is served', async () => {
    const track = await separatedTrack()
    writeTrackFile(track.id, 'instrumental.wav', '0123456789')

    const part = await fetch(`${api.baseUrl}/api/tracks/${track.id}/backing`, { headers: { range: 'bytes=2-5' } })
    expect(part.status).toBe(206)
    expect(await part.text()).toBe('2345')
  })
})
