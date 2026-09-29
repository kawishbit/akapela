import { describe, expect, test } from 'vitest'
import { describeError, describeJobFailure } from '../../app/utils/errors'
import { englishTranslate } from './i18n'

const t = englishTranslate()

describe('describeError', () => {
  test('an API error without a code is unexpected, with its message as Details', () => {
    const error = { data: { statusCode: 500, statusMessage: 'Server Error', message: 'boom' } }
    expect(describeError(error, t)).toEqual({ message: 'Something went wrong.', details: 'Server Error' })
  })

  test('anything else caught is unexpected, with what it said as Details', () => {
    expect(describeError(new Error('Failed to fetch'), t)).toEqual({ message: 'Something went wrong.', details: 'Failed to fetch' })
  })

  test('a code this browser has no words for reads as unexpected', () => {
    const error = { data: { statusMessage: 'Something new', data: { code: 'fromTheFuture', params: {} } } }
    expect(describeError(error, t)).toEqual({ message: 'Something went wrong.', details: 'Something new' })
  })
})

describe('describeJobFailure', () => {
  test('a Job from before codes existed reads as unexpected, with its old text as Details', () => {
    expect(describeJobFailure({ errorCode: null, errorParams: null, error: 'RuntimeError: yt-dlp exited 1' }, t))
      .toEqual({ message: 'Something went wrong.', details: 'RuntimeError: yt-dlp exited 1' })
  })

  test('an unexpected Job with no text has no Details', () => {
    expect(describeJobFailure({ errorCode: 'unexpected', errorParams: {}, error: null }, t))
      .toEqual({ message: 'Something went wrong.', details: null })
  })
})

describe('coded failures', () => {
  test('a Job with a code reads in words with its parameters, keeping the raw text as Details', () => {
    expect(describeJobFailure({ errorCode: 'modelDownloadFailed', errorParams: { model: 'Inst_HQ_3' }, error: 'Error: HTTP 503' }, t))
      .toEqual({ message: 'The Separation Model Inst_HQ_3 couldn\'t be downloaded. Check the server\'s connection, then retry.', details: 'Error: HTTP 503' })
  })

  test('an API error with a code reads in words, without repeating its English', () => {
    const error = { data: { statusMessage: 'yt-dlp found nothing', data: { code: 'sourceNotFound', params: {} } } }
    expect(describeError(error, t)).toEqual({ message: 'There\'s nothing to import at that link.', details: null })
  })
})

describe('a headline for an uncoded failure', () => {
  test('replaces "Something went wrong", keeping the Details', () => {
    expect(describeError(new Error('net::ERR_CONNECTION_RESET'), t, { headline: 'The Take couldn\'t be uploaded.' }))
      .toEqual({ message: 'The Take couldn\'t be uploaded.', details: 'net::ERR_CONNECTION_RESET' })
  })

  test('never replaces a code\'s own words', () => {
    const error = { data: { statusMessage: 'x', data: { code: 'sourceNotFound', params: {} } } }
    expect(describeError(error, t, { headline: 'Import failed.' }).message).toBe('There\'s nothing to import at that link.')
  })
})
