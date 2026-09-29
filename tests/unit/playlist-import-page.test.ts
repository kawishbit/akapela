import { describe, expect, test } from 'vitest'
import type { JobListEntry } from '../../server/lib/job-actions'
import { formatEstimate, playlistImportGroups, separationEstimateMs } from '../../app/utils/playlist-import'
import { englishTranslate } from './i18n'

const t = englishTranslate()
const MINUTE = 60_000

describe('separationEstimateMs', () => {
  test('is the rate times the ticked songs\' length', () => {
    expect(separationEstimateMs(0.25, [240_000, 120_000])).toBe(90_000)
    expect(separationEstimateMs(0.25, [])).toBe(0)
  })
})

describe('formatEstimate', () => {
  test.each([
    [20_000, 'under a minute'],
    [1 * MINUTE, '1 min'],
    [7.4 * MINUTE, '7 min'],
    [23 * MINUTE, '25 min'],
    [58 * MINUTE, '1 h'],
    [110 * MINUTE, '1 h 50 min'],
    [114 * MINUTE, '1 h 50 min'],
    [236 * MINUTE, '4 h'],
  ])('%d ms reads as about %s', (ms, words) => {
    expect(formatEstimate(ms, t)).toBe(words)
  })
})

function entry(overrides: Partial<JobListEntry> & Pick<JobListEntry, 'id'>): JobListEntry {
  return {
    type: 'import',
    targetId: `t-${overrides.id}`,
    state: 'queued',
    progress: 0,
    error: null,
    errorCode: null,
    errorParams: null,
    createdAt: 1000,
    startedAt: null,
    finishedAt: null,
    traceParent: null,
    separationModel: null,
    detail: null,
    playlistImportId: null,
    playlistImportName: null,
    lane: 'light',
    track: null,
    take: null,
    ...overrides,
  }
}

const EIGHTIES = { playlistImportId: 'p1', playlistImportName: 'All Out 80s' }

describe('playlistImportGroups', () => {
  test('gathers a Playlist Import\'s Jobs into one group, with how far it has got', () => {
    const jobs = [
      entry({ id: 'a', ...EIGHTIES, state: 'succeeded', createdAt: 1, finishedAt: 5 }),
      entry({ id: 'a-sep', ...EIGHTIES, type: 'separate', state: 'succeeded', createdAt: 6, finishedAt: 9 }),
      entry({ id: 'b', ...EIGHTIES, state: 'succeeded', createdAt: 2, finishedAt: 7 }),
      entry({ id: 'b-sep', ...EIGHTIES, type: 'separate', state: 'running', createdAt: 8 }),
      entry({ id: 'c', ...EIGHTIES, state: 'failed', createdAt: 3, finishedAt: 8 }),
      entry({ id: 'd', ...EIGHTIES, state: 'queued', createdAt: 4 }),
      entry({ id: 'mine', state: 'running', createdAt: 5 }),
    ]

    const { groups, others } = playlistImportGroups(jobs)

    expect(others.map(job => job.id)).toEqual(['mine'])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'p1', name: 'All Out 80s', songs: 4, imported: 2, separated: 1, failed: 1, active: true })
    // Running, then queued, then finished newest first, as the page lists any Jobs.
    expect(groups[0]!.jobs.map(job => job.id)).toEqual(['b-sep', 'd', 'a-sep', 'c', 'b', 'a'])
  })

  test('keeps two Playlist Imports apart, in the order they were started', () => {
    const jobs = [
      entry({ id: 'late', playlistImportId: 'p2', playlistImportName: 'Jazz', createdAt: 20 }),
      entry({ id: 'early', ...EIGHTIES, createdAt: 10 }),
    ]

    expect(playlistImportGroups(jobs).groups.map(group => group.name)).toEqual(['All Out 80s', 'Jazz'])
  })

  test('a group with nothing left to run is not active', () => {
    const { groups } = playlistImportGroups([entry({ id: 'a', ...EIGHTIES, state: 'cancelled' })])

    expect(groups[0]!.active).toBe(false)
  })

  test('no labelled Jobs, no groups', () => {
    expect(playlistImportGroups([entry({ id: 'a' })]).groups).toEqual([])
  })
})
