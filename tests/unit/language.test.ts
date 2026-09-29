import { describe, expect, test } from 'vitest'
import { browserLanguage, parseAcceptLanguage, resolveLanguage } from '../../app/utils/language'

describe('browserLanguage', () => {
  test('Indonesian, with or without a region, is Indonesian', () => {
    expect(browserLanguage(['id'])).toBe('id')
    expect(browserLanguage(['id-ID'])).toBe('id')
    expect(browserLanguage(['ID-id'])).toBe('id')
  })

  test('Malay is not Indonesian', () => {
    expect(browserLanguage(['ms-MY'])).toBe('en')
    expect(browserLanguage(['ms'])).toBe('en')
  })

  test('anything else is English', () => {
    expect(browserLanguage(['fr-FR', 'fr'])).toBe('en')
    expect(browserLanguage([])).toBe('en')
  })

  test('the first Language Akapela has wins', () => {
    expect(browserLanguage(['fr', 'id-ID', 'en'])).toBe('id')
    expect(browserLanguage(['en-GB', 'id'])).toBe('en')
  })

  test('"idx" is not "id"', () => {
    expect(browserLanguage(['idx'])).toBe('en')
  })
})

describe('resolveLanguage', () => {
  test('a chosen Language wins over the browser', () => {
    expect(resolveLanguage('en', ['id-ID'])).toBe('en')
    expect(resolveLanguage('id', ['en-US'])).toBe('id')
  })

  test('no choice, or one Akapela no longer has, follows the browser', () => {
    expect(resolveLanguage(undefined, ['id-ID'])).toBe('id')
    expect(resolveLanguage(null, ['fr'])).toBe('en')
    expect(resolveLanguage('xx', ['id'])).toBe('id')
  })
})

describe('parseAcceptLanguage', () => {
  test('orders by quality, keeping the header order on a tie', () => {
    expect(parseAcceptLanguage('fr;q=0.5, id-ID, en;q=0.8')).toEqual(['id-ID', 'en', 'fr'])
    expect(parseAcceptLanguage('en, id')).toEqual(['en', 'id'])
  })

  test('drops the wildcard and anything refused', () => {
    expect(parseAcceptLanguage('*, id;q=0, en')).toEqual(['en'])
  })

  test('an absent header is no preference', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([])
    expect(parseAcceptLanguage('')).toEqual([])
  })
})
