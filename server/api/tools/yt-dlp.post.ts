import { createError, defineEventHandler } from 'h3'
import { ytDlpIsManaged } from '../../lib/tools'
import { updateManagedYtDlp, YtDlpDownloadError } from '../../lib/ytdlp'

/**
 * Replace this Akapela's yt-dlp with the latest release, and say which version
 * landed.
 *
 * The breakage this exists for — YouTube changes, imports stop — used to need
 * `git pull && docker compose up -d --build`, an answer that only exists for
 * someone who cloned a repo (ADR 0010). It is refused outright where the
 * binary is not the app's to replace, which is every compose instance: there
 * the image bakes yt-dlp in, and rebuilding the image is still the answer.
 */
export default defineEventHandler(async () => {
  if (!ytDlpIsManaged()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This Akapela does not manage its own yt-dlp. Rebuild the image to update it.',
    })
  }
  try {
    return { version: await updateManagedYtDlp() }
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof YtDlpDownloadError
        ? error.message
        : `could not update yt-dlp: ${error instanceof Error ? error.message : error}`,
    })
  }
})
