/** Upload extensions Presto accepts. Shared by the API, which rejects anything else, and the file picker. */
export const UPLOAD_EXTENSIONS = ['mp3', 'm4a', 'wav', 'flac', 'ogg'] as const

export const UPLOAD_EXTENSIONS_SENTENCE
  = `${UPLOAD_EXTENSIONS.slice(0, -1).join(', ')}, or ${UPLOAD_EXTENSIONS.at(-1)}`

export const UNSUPPORTED_UPLOAD_MESSAGE = `Unsupported file type. Upload ${UPLOAD_EXTENSIONS_SENTENCE}.`

/** The `accept` attribute for a file input limited to supported uploads. */
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.map(ext => `.${ext}`).join(',')

/** The lower-cased supported extension of a filename, or null when the type is not supported. */
export function uploadExtension(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  const ext = filename.slice(dot + 1).toLowerCase()
  return (UPLOAD_EXTENSIONS as readonly string[]).includes(ext) ? ext : null
}
