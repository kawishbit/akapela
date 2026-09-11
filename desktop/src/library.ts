import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Which library folder is open.
 *
 * Changing it is a pointer change, not a move: choose a folder, restart, done.
 * A library is potentially tens of gigabytes across drives, and moving one
 * needs progress, cancellation, partial-failure recovery, and an answer for
 * "the target already has an `akapela.db`" — machinery the operating system's
 * own file manager already has. Pointing is also the more useful operation:
 * it is how someone opens the library their compose instance built.
 *
 * Nothing here moves, copies, or deletes anything at either location.
 */

export class LibraryDirError extends Error {}

/** The default library: `app.getPath('userData')/data`, so a first run needs no prompt. */
export function defaultLibraryDir(userDataDir: string): string {
  return join(userDataDir, 'data')
}

/**
 * Creates the folder if it does not exist and proves Akapela can write in it,
 * throwing if it cannot — checked before the restart rather than after, so the
 * app can never be left pointing at somewhere it cannot use.
 */
export function checkLibraryDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  }
  catch (error) {
    throw new LibraryDirError(
      `Akapela can't create ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  try {
    accessSync(dir, constants.W_OK)
  }
  catch {
    throw new LibraryDirError(`Akapela doesn't have permission to write in ${dir}. Pick a folder you own.`)
  }
  // W_OK is advisory on Windows, where a read-only directory still passes it,
  // so the only honest check is to actually write something and take it away.
  const probe = join(dir, '.akapela-write-test')
  try {
    writeFileSync(probe, '')
  }
  catch (error) {
    throw new LibraryDirError(
      `Akapela can't write in ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  finally {
    rmSync(probe, { force: true })
  }
}
