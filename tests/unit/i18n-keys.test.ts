import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import en from '../../i18n/locales/en.json'
import { ERROR_CODES, type ErrorCode } from '../../shared/error-codes'

/**
 * English is the source of truth (ADR 0014): every key the app asks for is in
 * `en.json`, and every other Language falls back to it a key at a time.
 *
 * Keys are found by a static scan of `app/`, not by typing them, because a
 * scan is what a vitest run can check without building Nuxt. What it reads:
 *
 * - `t('a.b')`, `$t('a.b')`, `te('a.b')`, `tm('a.b')` with a literal key, which
 *   must name a string (or, for `tm`, anything);
 * - `keypath="a.b"` on `<i18n-t>`, which must name a string;
 * - `` t(`a.b.${x}`) ``, a key built from data (a Job type, a Lyrics Provider),
 *   whose fixed part must name a group. The members themselves are checked by
 *   the tests for the code that builds them.
 *
 * So a key must be written where it is used. Passing one around in a variable
 * hides it from the scan; build it at the call instead.
 */

const root = fileURLToPath(new URL('../..', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(entry.name) ? [path] : []
  })
}

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
    en,
  )
}

interface Reference { file: string, key: string, kind: 'string' | 'any' | 'group' }

export function scanReferences(source: string, file: string): Reference[] {
  const found: Reference[] = []
  for (const match of source.matchAll(/(?<![\w.$])\$?(t|te|tm)\(\s*(['"])([^'"]+)\2/g)) {
    found.push({ file, key: match[3]!, kind: match[1] === 'tm' ? 'any' : 'string' })
  }
  for (const match of source.matchAll(/(?<![\w.$])\$?(?:t|te|tm)\(\s*`([^`$]*)\$\{/g)) {
    found.push({ file, key: match[1]!.replace(/\.$/, ''), kind: 'group' })
  }
  for (const match of source.matchAll(/\bkeypath="([^"]+)"/g)) {
    found.push({ file, key: match[1]!, kind: 'string' })
  }
  return found
}

const references = sourceFiles(join(root, 'app')).flatMap(path =>
  scanReferences(readFileSync(path, 'utf8'), relative(root, path).split(sep).join('/')),
)

describe('every key the app uses is in en.json', () => {
  test('the scan finds keys at all', () => {
    expect(references.length).toBeGreaterThan(0)
  })

  test('literal keys name a string', () => {
    const missing = references
      .filter(ref => ref.kind === 'string' && typeof lookup(ref.key) !== 'string')
      .map(ref => `${ref.file}: ${ref.key}`)
    expect(missing).toEqual([])
  })

  test('keys asked for with tm() exist', () => {
    const missing = references
      .filter(ref => ref.kind === 'any' && lookup(ref.key) === undefined)
      .map(ref => `${ref.file}: ${ref.key}`)
    expect(missing).toEqual([])
  })

  test('keys built from data start from a group', () => {
    const missing = references
      .filter((ref) => {
        const node = lookup(ref.key)
        return ref.kind === 'group' && (!node || typeof node !== 'object')
      })
      .map(ref => `${ref.file}: ${ref.key}`)
    expect(missing).toEqual([])
  })
})

describe('every error code has words in en.json', () => {
  test.each(Object.keys(ERROR_CODES) as ErrorCode[])('%s', (code) => {
    const message = lookup(`errors.${code}`)
    expect(typeof message, `errors.${code} is missing from en.json`).toBe('string')
    const placeholders = [...(message as string).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
    expect(placeholders, `errors.${code} should use exactly its parameters`).toEqual([...new Set(ERROR_CODES[code])].sort())
  })
})

describe('the scan itself', () => {
  test('reads literal, template, and keypath keys, and ignores lookalikes', () => {
    const source = `t('a.b'); $t("c.d"); te('e'); tm('f'); t(\`g.h.\${x}\`); <i18n-t keypath="i.j">; set('no'); x.at('no')`
    expect(scanReferences(source, 'x.vue').map(ref => `${ref.kind}:${ref.key}`)).toEqual([
      'string:a.b', 'string:c.d', 'string:e', 'any:f', 'group:g.h', 'string:i.j',
    ])
  })
})
