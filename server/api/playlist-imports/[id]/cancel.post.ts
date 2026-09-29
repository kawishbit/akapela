import { defineEventHandler, getRouterParam } from 'h3'
import { cancelPlaylistImport } from '../../../lib/job-actions'

/**
 * Cancel all: every queued or running Job of one Playlist Import, each the
 * ordinary way. Tracks that already finished importing stay. Answers with how
 * many were cancelled, which is zero once nothing is left to cancel.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  return { cancelled: await cancelPlaylistImport(event.context.akapela, id) }
})
