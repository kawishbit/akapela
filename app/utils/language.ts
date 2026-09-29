/**
 * The Language the app's words are shown in (`CONTEXT.md`). Chosen per
 * device: a cookie, not a server Setting, so a phone set to Indonesian leaves
 * the TV in English (ADR 0014 amendment). With no cookie it follows the
 * browser, and only a pick on the Settings page ever writes one.
 */

export const LANGUAGES = ['en', 'id'] as const
export type Language = (typeof LANGUAGES)[number]

/** Each Language named in its own words, which is how a picker should list them. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
}

export const LANGUAGE_COOKIE = 'akapela-language'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * The first of the browser's languages that Akapela has, or English. Only the
 * primary subtag counts, so `id-ID` is Indonesian; Malay (`ms`) is close to
 * Indonesian but not the same Language, and falls to English like the rest.
 */
export function browserLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const primary = tag.split('-')[0]!.toLowerCase()
    if (isLanguage(primary)) return primary
  }
  return 'en'
}

/** The cookie when it names a Language Akapela has, otherwise the browser's. */
export function resolveLanguage(cookie: string | null | undefined, preferred: readonly string[]): Language {
  return isLanguage(cookie) ? cookie : browserLanguage(preferred)
}

/** An `Accept-Language` header as a list of tags, most preferred first, the way `navigator.languages` reads. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return { tag: tag.trim(), quality: q ? Number(q.slice(2)) : 1, index }
    })
    .filter(({ tag, quality }) => tag && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag)
}
