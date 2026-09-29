import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { modelUrl, PARTIAL_MD5_BYTES, type SeparationModel } from './models.ts'

/**
 * Fetches a Separation Model if it isn't already cached. Mirrors
 * `MdxNetSeparator.fetch_model` (ticket 06, `.scratch/worker-to-typescript/`):
 * no model is baked into any image or installer; each is fetched into the
 * cache the first time a Separation asks for it, and reused after that.
 *
 * The URL is the same public UVR model repository `audio-separator` itself
 * downloads from (`Separator.download_model_files`'s
 * `public_model_repo_url_prefix`), and the file is checked against the
 * catalog's `partialMd5` — the hash that registry's config was looked up by —
 * before it is put where a Separation will find it. A different file under
 * the same name would run with the wrong config and produce garbage rather
 * than fail, so it is refused instead.
 */

export class ModelDownloadError extends Error {}

export interface FetchModelOptions {
  /** How much of the download has arrived, 0 to 1. Only called when the server says how big it is. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export function modelPath(modelsDir: string, model: SeparationModel): string {
  return join(modelsDir, model.fileName)
}

/** Puts `model` at `<modelsDir>/<fileName>`, or does nothing if it is already there. */
export async function fetchModel(modelsDir: string, model: SeparationModel, options: FetchModelOptions = {}): Promise<string> {
  const dest = modelPath(modelsDir, model)
  if (existsSync(dest)) return dest

  const fail = (why: string) => new ModelDownloadError(
    `could not download the Separation Model ${model.name} (${model.fileName}), which is fetched from the network `
    + `the first time a Separation needs it: ${why}`,
  )

  await mkdir(modelsDir, { recursive: true })
  let response: Response
  try {
    response = await fetch(modelUrl(model), { signal: options.signal })
  }
  catch (error) {
    options.signal?.throwIfAborted()
    throw fail(error instanceof Error ? error.message : String(error))
  }
  if (!response.ok || !response.body) throw fail(`HTTP ${response.status}`)

  const tmp = `${dest}.part`
  try {
    await writeBody(response, tmp, options)
    const hash = await partialMd5(tmp)
    if (hash !== model.partialMd5) {
      throw new Error(`it is not the file Akapela expects (hash ${hash}, expected ${model.partialMd5})`)
    }
  }
  catch (error) {
    await rm(tmp, { force: true })
    options.signal?.throwIfAborted()
    throw fail(error instanceof Error ? error.message : String(error))
  }
  await rename(tmp, dest)
  return dest
}

/** Streams to disk rather than buffering: the larger models are 66 MB, and compose gives the whole app 2 GB. */
async function writeBody(response: Response, path: string, { onProgress }: FetchModelOptions): Promise<void> {
  const total = Number(response.headers.get('content-length')) || 0
  const file = await open(path, 'w')
  try {
    let received = 0
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      await file.write(chunk)
      received += chunk.byteLength
      if (total > 0) onProgress?.(Math.min(1, received / total))
    }
  }
  finally {
    await file.close()
  }
}

/** The MD5 of a file's last `PARTIAL_MD5_BYTES`, or of all of it when it is smaller — UVR's model hash. */
export async function partialMd5(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const size = (await file.stat()).size
    const length = Math.min(size, PARTIAL_MD5_BYTES)
    const buffer = Buffer.alloc(length)
    await file.read(buffer, 0, length, size - length)
    return createHash('md5').update(buffer).digest('hex')
  }
  finally {
    await file.close()
  }
}
