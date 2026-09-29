import { describe, expect, it } from 'vitest'
import { layerGains, needsGuideVocal, primaryFile, trackAudioUrl } from '../../app/audio/backing-files'

describe('what the browser engine fetches', () => {
  it('fetches the original audio for Original, and the Instrumental Stem first for Stems', () => {
    expect(primaryFile('original')).toBe('original')
    expect(primaryFile('stems')).toBe('instrumental')
  })

  it('names each file by what it is, not by whatever the Track happens to be on', () => {
    expect(trackAudioUrl('t1', 'original')).toBe('/api/tracks/t1/backing?source=original')
    expect(trackAudioUrl('t1', 'instrumental')).toBe('/api/tracks/t1/backing?stem=instrumental')
    expect(trackAudioUrl('t1', 'vocals')).toBe('/api/tracks/t1/backing?stem=vocals')
  })

  it('fetches the Vocals Stem only once the Guide Vocal will be heard', () => {
    expect(needsGuideVocal({ source: 'stems', stemLevels: { guideVocal: 0, instrumental: 1 } })).toBe(false)
    expect(needsGuideVocal({ source: 'stems', stemLevels: { guideVocal: 0, instrumental: 0 } })).toBe(false)
    expect(needsGuideVocal({ source: 'stems', stemLevels: { guideVocal: 0.01, instrumental: 1 } })).toBe(true)
    // On Original the levels are only remembered, so nothing more is fetched.
    expect(needsGuideVocal({ source: 'original', stemLevels: { guideVocal: 1, instrumental: 1 } })).toBe(false)
  })
})

describe('layerGains', () => {
  it('plays Original as the one layer at unity, whatever the remembered levels', () => {
    expect(layerGains({ source: 'original', stemLevels: { guideVocal: 0.5, instrumental: 0.2 } })).toEqual([1])
  })

  it('gives Stems the Instrumental first, then the Guide Vocal, in the worklet\'s layer order', () => {
    expect(layerGains({ source: 'stems', stemLevels: { guideVocal: 0.3, instrumental: 0.8 } })).toEqual([0.8, 0.3])
  })
})
