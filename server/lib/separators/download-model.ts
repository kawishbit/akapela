import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Fetches the MDX-Net model this app uses if it isn't already cached.
 * Mirrors `MdxNetSeparator.fetch_model` (ticket 06,
 * `.scratch/worker-to-typescript/`): the model is not baked into any image,
 * fetched once into the cache path from ticket 01 and reused after that.
 *
 * The URL is the same public UVR model repository `audio-separator` itself
 * downloads from (`Separator.download_model_files`'s
 * `public_model_repo_url_prefix`), hardcoded to this one model rather than
 * reproducing that library's general model-catalog machinery — Akapela only
 * ever asks for one model (ADR 0008).
 */
export const MODEL_FILENAME = 'UVR-MDX-NET-Inst_HQ_3.onnx'

const MODEL_URL
  = `https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/${MODEL_FILENAME}`

export class ModelDownloadError extends Error {}

/** Puts the model at `<modelsDir>/UVR-MDX-NET-Inst_HQ_3.onnx`, or does nothing if it is already there. */
export async function fetchModel(modelsDir: string): Promise<string> {
  const dest = join(modelsDir, MODEL_FILENAME)
  if (existsSync(dest)) return dest

  await mkdir(modelsDir, { recursive: true })
  let response: Response
  try {
    response = await fetch(MODEL_URL)
  }
  catch (error) {
    throw new ModelDownloadError(
      `could not download the separation model ${MODEL_FILENAME}, which is fetched from the network `
      + `the first time a Track is separated: ${error instanceof Error ? error.message : error}`,
    )
  }
  if (!response.ok || !response.body) {
    throw new ModelDownloadError(
      `could not download the separation model ${MODEL_FILENAME}: HTTP ${response.status}`,
    )
  }

  const tmp = `${dest}.part`
  try {
    const bytes = new Uint8Array(await response.arrayBuffer())
    await writeFile(tmp, bytes)
  }
  catch (error) {
    await rm(tmp, { force: true })
    throw new ModelDownloadError(
      `could not download the separation model ${MODEL_FILENAME}: ${error instanceof Error ? error.message : error}`,
    )
  }
  await rename(tmp, dest)
  return dest
}
