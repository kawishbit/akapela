import { describe, expect, test } from 'vitest'
import type { JobListEntry } from '../../server/lib/job-actions'
import { activeJobCount, jobActivity, jobDetailText, jobSections, queuedBehind, takeLabel } from '../../app/utils/jobs'
import { JOB_TYPES } from '../../server/db/schema'
import { JOB_DETAILS } from '../../shared/job-detail'
import { englishTranslate } from './i18n'

const t = englishTranslate()

function entry(overrides: Partial<JobListEntry> & Pick<JobListEntry, 'id'>): JobListEntry {
  return {
    type: 'import',
    targetId: 't1',
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
    lane: 'light',
    track: { id: 't1', title: 'Yesterday', artist: null, updatedAt: 1 },
    take: null,
    ...overrides,
  }
}

describe('jobSections', () => {
  test('puts running, queued, and finished Jobs in their own sections', () => {
    const jobs = [
      entry({ id: 'done-early', state: 'succeeded', createdAt: 1, finishedAt: 10 }),
      entry({ id: 'sep', type: 'separate', lane: 'heavy', state: 'running', createdAt: 2 }),
      entry({ id: 'wait-1', state: 'queued', createdAt: 3 }),
      entry({ id: 'failed-late', state: 'failed', createdAt: 4, finishedAt: 30 }),
      entry({ id: 'mix', type: 'render', state: 'running', createdAt: 5 }),
      entry({ id: 'wait-2', type: 'separate', lane: 'heavy', state: 'queued', createdAt: 6 }),
      entry({ id: 'cancelled', state: 'cancelled', createdAt: 7, finishedAt: 20 }),
    ]

    const sections = jobSections(jobs)

    expect(sections.running.map(job => job.id)).toEqual(['sep', 'mix'])
    // In the order they will run.
    expect(sections.queued.map(job => job.id)).toEqual(['wait-1', 'wait-2'])
    // Newest first.
    expect(sections.finished.map(job => job.id)).toEqual(['failed-late', 'cancelled', 'done-early'])
  })

  test('orders queued Jobs by creation even if they arrive out of order', () => {
    const sections = jobSections([entry({ id: 'b', createdAt: 20 }), entry({ id: 'a', createdAt: 10 })])

    expect(sections.queued.map(job => job.id)).toEqual(['a', 'b'])
  })
})

describe('activeJobCount', () => {
  test('counts queued and running Jobs, not finished ones', () => {
    const jobs = [
      entry({ id: '1', state: 'queued' }),
      entry({ id: '2', state: 'running' }),
      entry({ id: '3', state: 'succeeded' }),
      entry({ id: '4', state: 'failed' }),
      entry({ id: '5', state: 'cancelled' }),
    ]
    expect(activeJobCount(jobs)).toBe(2)
    expect(activeJobCount([])).toBe(0)
  })
})

describe('jobActivity', () => {
  test('says what each type of Job is doing, and names one it does not know', () => {
    expect(jobActivity('import', t)).toBe('Importing')
    expect(jobActivity('separate', t)).toBe('Separating')
    expect(jobActivity('render', t)).toBe('Mixing')
    expect(jobActivity('noop', t)).toBe('Working')
    // @ts-expect-error - a type added later still gets a row
    expect(jobActivity('teleport', t)).toBe('Working')
  })

  test.each(JOB_TYPES)('%s has words in en.json', (type) => {
    expect(jobActivity(type, t)).not.toContain('jobs.')
  })
})

describe('jobDetailText', () => {
  test('puts a token into words, naming the Job\'s own Separation Model', () => {
    expect(jobDetailText({ detail: 'downloadingModel', separationModel: 'Inst_HQ_3' }, t)).toBe('Downloading Inst_HQ_3')
    expect(jobDetailText({ detail: 'finishedOnCpu', separationModel: null }, t)).toBe('Finished on CPU: the GPU failed')
  })

  test('shows a line from before the tokens as it is, and nothing as nothing', () => {
    expect(jobDetailText({ detail: 'Downloading Inst_Main', separationModel: null }, t)).toBe('Downloading Inst_Main')
    expect(jobDetailText({ detail: null, separationModel: null }, t)).toBeNull()
  })

  test.each(JOB_DETAILS)('%s has words in en.json', (detail) => {
    expect(jobDetailText({ detail, separationModel: 'Inst_Main' }, t)).not.toContain('jobs.')
  })
})

describe('queuedBehind', () => {
  test('says what a queued Job waits behind without saying Lane', () => {
    expect(queuedBehind('heavy', t)).toBe('Waits for other Separations')
    expect(queuedBehind('light', t)).toBe('Waits for imports and Mixes')
  })
})

describe('takeLabel', () => {
  test('names a Take by its number and the time it was sung, in the chosen Language\'s clock', () => {
    const sungAt = new Date(2026, 8, 26, 14, 3).getTime()
    const label = takeLabel({ id: 'k', number: 2, createdAt: sungAt }, t, 'id')
    expect(label).toMatch(/^Take 2, /)
    // Indonesian writes the time with a dot, whatever the browser's own locale.
    expect(label).toContain('14.03')
  })
})
