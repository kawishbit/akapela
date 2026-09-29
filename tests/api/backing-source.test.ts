import { existsSync, rmSync, writeFileSync } from 'node:fs'
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

  test('a succeeded separation flips it to Stems, so the common case takes no tap', async () => {
    const track = await separatedTrack()

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('stems')
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

  test('and switching to Stems again persists too', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems' })
    expect(res.status).toBe(200)
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('stems')
  })

  test('Stems are refused on a Track with no Stems, saying to separate it first', async () => {
    const track = await importedTrack()

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems' })
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/separate it first/i)

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('original')
  })

  test('the name Stems had before there were levels still switches to them', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'instrumental' })
    expect(res.status).toBe(200)
    expect((await res.json()).backingSource).toBe('stems')
  })

  test('a Track still separating for the first time has no Stems yet either', async () => {
    const track = await importedTrack()
    await api.post(`/api/tracks/${track.id}/separate`, {})

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems' })
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

    const separating = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems' })
    expect(separating.status).toBe(200)

    api.finishSeparation(track.id, again.separationJob.id, 'failed', 'SeparationError: the model refused this audio')
    const failed = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    expect(failed.status).toBe(200)
    expect((await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems' })).status).toBe(200)
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

describe('Stem Levels', () => {
  const DEFAULT_LEVELS = { guideVocal: 0, instrumental: 1 }

  async function levelsOf(trackId: string) {
    return (await (await api.get(`/api/tracks/${trackId}`)).json()).stemLevels
  }

  test('a Track starts with no Guide Vocal and the whole Instrumental', async () => {
    const track = await importedTrack()

    expect(track.stemLevels).toEqual(DEFAULT_LEVELS)
    expect(await levelsOf(track.id)).toEqual(DEFAULT_LEVELS)
  })

  test('are set beside the Backing Source, persist, and come back on Track detail', async () => {
    const track = await separatedTrack()

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, {
      backingSource: 'stems',
      stemLevels: { guideVocal: 0.3, instrumental: 0.9 },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).stemLevels).toEqual({ guideVocal: 0.3, instrumental: 0.9 })
    expect(await levelsOf(track.id)).toEqual({ guideVocal: 0.3, instrumental: 0.9 })
  })

  test('can be saved on their own, keeping whatever source the Track is on', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, { stemLevels: { guideVocal: 0.6, instrumental: 1 } })
    expect(res.status).toBe(200)
    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.backingSource).toBe('original')
    expect(detail.stemLevels).toEqual({ guideVocal: 0.6, instrumental: 1 })
  })

  test('are left alone by a switch that does not name them', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems', stemLevels: { guideVocal: 0.3, instrumental: 1 } })

    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems' })

    expect(await levelsOf(track.id)).toEqual({ guideVocal: 0.3, instrumental: 1 })
  })

  test('can be set while on Original, and are remembered for later', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'original' })

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, {
      backingSource: 'original',
      stemLevels: { guideVocal: 0.5, instrumental: 1 },
    })
    expect(res.status).toBe(200)
    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.backingSource).toBe('original')
    expect(detail.stemLevels).toEqual({ guideVocal: 0.5, instrumental: 1 })
  })

  test('outside 0 to 1 are a 400 that says the range, and change nothing', async () => {
    const track = await separatedTrack()

    for (const stemLevels of [{ guideVocal: 1.5, instrumental: 1 }, { guideVocal: 0, instrumental: -1 }, { guideVocal: 0 }, 'loud']) {
      const res = await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems', stemLevels })
      expect(res.status).toBe(400)
      expect(res.statusText).toMatch(/from 0 to 1/)
    }
    expect(await levelsOf(track.id)).toEqual(DEFAULT_LEVELS)
  })

  test('outlive deleting the Stems, which puts the Track back on Original', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems', stemLevels: { guideVocal: 0.4, instrumental: 1 } })

    const deleted = await (await api.del(`/api/tracks/${track.id}/stems`)).json()
    expect(deleted.backingSource).toBe('original')
    expect(deleted.stemLevels).toEqual({ guideVocal: 0.4, instrumental: 1 })
    expect(await levelsOf(track.id)).toEqual({ guideVocal: 0.4, instrumental: 1 })
  })

  test('outlive separating again, which switches the Track back to Stems at them', async () => {
    const track = await separatedTrack()
    await api.put(`/api/tracks/${track.id}/backing-source`, { backingSource: 'stems', stemLevels: { guideVocal: 0.2, instrumental: 0.8 } })
    await api.del(`/api/tracks/${track.id}/stems`)

    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    writeTrackFile(track.id, 'instrumental.wav', 'the instrumental')
    writeTrackFile(track.id, 'vocals.wav', 'the vocals')
    api.finishSeparation(track.id, separationJob.id, 'succeeded')

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.backingSource).toBe('stems')
    expect(detail.stemLevels).toEqual({ guideVocal: 0.2, instrumental: 0.8 })
  })

  test('do not make Stems appear on a Track that has none', async () => {
    const track = await importedTrack()

    const res = await api.put(`/api/tracks/${track.id}/backing-source`, {
      backingSource: 'stems',
      stemLevels: { guideVocal: 0.5, instrumental: 1 },
    })
    expect(res.status).toBe(409)
    expect(await levelsOf(track.id)).toEqual(DEFAULT_LEVELS)
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
    expect(await (await api.get(`/api/tracks/${track.id}/backing?source=stems`)).text()).toBe('the instrumental')
    // The name `stems` had before there were Stem Levels still means the same.
    expect(await (await api.get(`/api/tracks/${track.id}/backing?source=instrumental`)).text()).toBe('the instrumental')
    // Auditioning does not change what the Track sings over next time.
    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).backingSource).toBe('stems')
  })

  test('the Vocals Stem is not a Backing Source, so it cannot be asked for', async () => {
    const track = await separatedTrack()

    const res = await api.get(`/api/tracks/${track.id}/backing?source=vocals`)
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/original/i)
  })

  test('each Stem can be asked for by name, since Stems are blended by whoever plays them', async () => {
    const track = await separatedTrack()

    expect(await (await api.get(`/api/tracks/${track.id}/backing?stem=vocals`)).text()).toBe('the vocals')
    expect(await (await api.get(`/api/tracks/${track.id}/backing?stem=instrumental`)).text()).toBe('the instrumental')

    const res = await api.get(`/api/tracks/${track.id}/backing?stem=original`)
    expect(res.status).toBe(400)
    expect(res.statusText).toMatch(/vocals/i)
  })

  test('range requests work on a Stem asked for by name', async () => {
    const track = await separatedTrack()
    writeTrackFile(track.id, 'vocals.wav', '0123456789')

    const part = await fetch(`${api.baseUrl}/api/tracks/${track.id}/backing?stem=vocals`, { headers: { range: 'bytes=2-5' } })
    expect(part.status).toBe(206)
    expect(await part.text()).toBe('2345')
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

describe('deleting Stems', () => {
  test('removes both Stem files and puts the Track back on its original audio', async () => {
    const track = await separatedTrack()
    const dir = join(api.dataDir, 'tracks', track.id)

    const res = await api.del(`/api/tracks/${track.id}/stems`)
    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.backingSource).toBe('original')
    expect(updated.separationState).toBe('none')

    expect(existsSync(join(dir, 'instrumental.wav'))).toBe(false)
    expect(existsSync(join(dir, 'vocals.wav'))).toBe(false)
    // Never touched: it is what switching back to `original` plays.
    expect(existsSync(join(dir, 'backing.wav'))).toBe(true)

    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.backingSource).toBe('original')
    expect(detail.separationState).toBe('none')
    expect(detail.hasStems).toBe(false)
  })

  test('leaves the Track\'s Takes and Mixes alone', async () => {
    const track = await separatedTrack()
    const take = await (await api.uploadTake(
      track.id,
      Buffer.from('RIFF....WAVEfmt data0123456789'),
      {
        startPositionMs: 1000,
        durationMs: 2000,
        adjustments: { pitchSemitones: 0, tempoPercent: 100, linked: false },
        backingSource: 'original',
      },
    )).json()
    const mix = await (await api.requestMix(track.id, take.id, {
      adjustments: { pitchSemitones: 0, tempoPercent: 100, linked: false },
      backingSource: 'original',
      latencyNudgeMs: 0,
      vocalGain: 1,
      backingGain: 1,
      wav: false,
    })).json()

    expect((await api.del(`/api/tracks/${track.id}/stems`)).status).toBe(200)

    expect((await api.get(`/api/tracks/${track.id}/takes`)).status).toBe(200)
    const takes = await (await api.get(`/api/tracks/${track.id}/takes`)).json()
    expect(takes.map((t: { id: string }) => t.id)).toContain(take.id)
    const mixes = await (await api.get(`/api/tracks/${track.id}/takes/${take.id}/mixes`)).json()
    expect(mixes.map((m: { id: string }) => m.id)).toContain(mix.id)
  })

  test('a Track with no Stems to delete is a 409', async () => {
    const track = await importedTrack()

    const res = await api.del(`/api/tracks/${track.id}/stems`)
    expect(res.status).toBe(409)
    expect(res.statusText).toMatch(/no Stems/i)
  })

  test('an unknown Track is a 404', async () => {
    expect((await api.del('/api/tracks/does-not-exist/stems')).status).toBe(404)
  })
})

describe('the disk space Stems take up', () => {
  test('sums both Stem files, and drops to zero once they are deleted', async () => {
    const track = await separatedTrack()
    writeTrackFile(track.id, 'instrumental.wav', 'x'.repeat(100))
    writeTrackFile(track.id, 'vocals.wav', 'x'.repeat(50))

    const before = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(before.stemsBytes).toBe(150)

    await api.del(`/api/tracks/${track.id}/stems`)
    const after = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(after.stemsBytes).toBe(0)
  })

  test('is zero on a Track nobody has separated', async () => {
    const track = await importedTrack()

    expect((await (await api.get(`/api/tracks/${track.id}`)).json()).stemsBytes).toBe(0)
  })
})

describe('a Track stored as FLAC', () => {
  /** What a library switched to FLAC holds: the same files, a different extension. */
  async function flacTrack() {
    const track = await importedTrack()
    const { separationJob } = await (await api.post(`/api/tracks/${track.id}/separate`, {})).json()
    writeTrackFile(track.id, 'backing.flac', 'the original, in FLAC')
    writeTrackFile(track.id, 'instrumental.flac', 'the instrumental, in FLAC')
    writeTrackFile(track.id, 'vocals.flac', 'the vocals, in FLAC')
    api.finishSeparation(track.id, separationJob.id, 'succeeded')
    return track
  }

  test('streams whichever file is there, as what it is', async () => {
    const track = await flacTrack()

    const instrumental = await api.get(`/api/tracks/${track.id}/backing`)
    expect(instrumental.headers.get('content-type')).toBe('audio/flac')
    expect(await instrumental.text()).toBe('the instrumental, in FLAC')

    const original = await api.get(`/api/tracks/${track.id}/backing?source=original`)
    expect(await original.text()).toBe('the original, in FLAC')
  })

  test('has Stems, and Delete Stems removes them', async () => {
    const track = await flacTrack()
    const detail = await (await api.get(`/api/tracks/${track.id}`)).json()
    expect(detail.hasStems).toBe(true)
    expect(detail.stemsBytes).toBe('the instrumental, in FLAC'.length + 'the vocals, in FLAC'.length)

    await api.del(`/api/tracks/${track.id}/stems`)

    const dir = join(api.dataDir, 'tracks', track.id)
    expect(existsSync(join(dir, 'instrumental.flac'))).toBe(false)
    expect(existsSync(join(dir, 'vocals.flac'))).toBe(false)
    expect(existsSync(join(dir, 'backing.flac'))).toBe(true)
  })

  test('sits beside a WAV Track in the same library, each served as its own format', async () => {
    const wav = await separatedTrack()
    const flac = await flacTrack()
    expect((await api.get(`/api/tracks/${wav.id}/backing`)).headers.get('content-type')).toBe('audio/wav')
    expect((await api.get(`/api/tracks/${flac.id}/backing`)).headers.get('content-type')).toBe('audio/flac')
  })
})
