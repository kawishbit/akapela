import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createError, defineEventHandler, readMultipartFormData, setResponseStatus } from 'h3'
import { applyStagedRestore, BackupError, hasLibraryData, stageRestore } from '../../lib/backup'

export const RESTORE_NEEDS_CONFIRMATION_MESSAGE
  = 'Restoring replaces your entire library. Confirm to continue.'

/**
 * Restores a backup archive uploaded under `file`, requiring `confirm: "true"`
 * when the library already has a Track to lose. On success the process exits
 * shortly after responding, so a fresh one opens the restored files cleanly
 * rather than this one carrying on against a database connection it just
 * closed — see `applyStagedRestore`.
 */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.filename) throw createError({ statusCode: 400, statusMessage: 'No backup file uploaded' })
  const confirmed = parts?.some(part => part.name === 'confirm' && part.data.toString() === 'true') ?? false

  const akapela = event.context.akapela
  if (hasLibraryData(akapela) && !confirmed) {
    throw createError({ statusCode: 409, statusMessage: RESTORE_NEEDS_CONFIRMATION_MESSAGE })
  }

  const uploadDir = await mkdtemp(join(tmpdir(), 'akapela-restore-upload-'))
  try {
    const archivePath = join(uploadDir, 'upload.tar.gz')
    await writeFile(archivePath, file.data)
    try {
      await stageRestore(akapela, archivePath)
    }
    catch (error) {
      if (error instanceof BackupError) throw createError({ statusCode: 400, statusMessage: error.message })
      throw error
    }
    await applyStagedRestore(akapela)
  }
  finally {
    await rm(uploadDir, { recursive: true, force: true })
  }

  setResponseStatus(event, 202)
  // Long enough for the response above to actually reach the client before
  // the process that would have sent it is gone.
  setTimeout(() => process.exit(0), 250)
  return { restarting: true }
})
