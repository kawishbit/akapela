import { defineEventHandler, getQuery } from 'h3'
import { listTracks } from '../lib/tracks'

/** The library: every Track, newest first. `?q=` narrows by title or artist. */
export default defineEventHandler((event) => {
  const { q } = getQuery(event)
  return listTracks(event.context.akapela, typeof q === 'string' ? q : '')
})
