/**
 * How complete each Language other than English is.
 *
 *   pnpm i18n:completeness
 *
 * English is the source of truth (ADR 0014): `en.json` has every key, and any
 * other Language falls back to it a key at a time. This lists, for each other
 * file under `i18n/locales/`, the keys it has yet to translate and the keys it
 * still carries that `en.json` no longer has. It reports and never fails: a
 * Language that lags behind still works, in English where it has gaps.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Messages = { [key: string]: string | Messages }

export interface Completeness {
  total: number
  translated: number
  /** Keys `en.json` has and this Language doesn't. */
  missing: string[]
  /** Keys this Language has and `en.json` doesn't, left behind by a rename. */
  stale: string[]
}

function leaves(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [path] : leaves(value, path)
  })
}

export function completeness(english: Messages, other: Messages): Completeness {
  const want = leaves(english)
  const have = new Set(leaves(other))
  const wanted = new Set(want)
  const missing = want.filter(key => !have.has(key))
  return {
    total: want.length,
    translated: want.length - missing.length,
    missing,
    stale: [...have].filter(key => !wanted.has(key)),
  }
}

export function formatReport(language: string, result: Completeness): string {
  const percent = result.total === 0 ? 100 : Math.floor((result.translated / result.total) * 100)
  const lines = [`${language}: ${percent}% (${result.translated} of ${result.total})`]
  for (const key of result.missing) lines.push(`  missing: ${key}`)
  for (const key of result.stale) lines.push(`  stale: ${key}`)
  return lines.join('\n')
}

function main(): void {
  const dir = fileURLToPath(new URL('../i18n/locales/', import.meta.url))
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Messages
  const english = read('en.json')
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'en.json').sort()) {
    console.log(formatReport(basename(file, '.json'), completeness(english, read(file))))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
