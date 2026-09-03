import { createReadStream, statSync } from 'node:fs'
import { createError, getRequestHeader, sendStream, setResponseHeaders, setResponseStatus, type H3Event } from 'h3'

/**
 * Streams a file from the data directory with HTTP range support, so the
 * browser can seek within a Backing Track and fetch it for decoding. Files
 * are only ever reached through here, never exposed as static assets.
 */
export async function sendFile(event: H3Event, path: string, contentType: string): Promise<void> {
  let size: number
  try {
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error('not a file')
    size = stat.size
  }
  catch {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }

  const range = parseRange(getRequestHeader(event, 'range'), size)
  if (range === 'unsatisfiable') {
    setResponseHeaders(event, { 'content-range': `bytes */${size}` })
    throw createError({ statusCode: 416, statusMessage: 'Range not satisfiable' })
  }

  const headers: Record<string, string> = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-cache',
  }
  if (range) {
    setResponseStatus(event, 206)
    headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['content-length'] = String(range.end - range.start + 1)
  }
  else {
    headers['content-length'] = String(size)
  }
  setResponseHeaders(event, headers)
  return sendStream(event, createReadStream(path, range ?? undefined))
}

/** Parses a single `bytes=start-end` range header against a file size. */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number, end: number } | 'unsatisfiable' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startText, endText] = match
  if (startText === '' && endText === '') return null
  let start: number
  let end: number
  if (startText === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(endText)
    if (suffix === 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  }
  else {
    start = Number(startText)
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1)
  }
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}
