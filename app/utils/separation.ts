import type { SeparationModelName } from '~~/server/lib/separators/models'
import { formatMegabytes } from './format'

/**
 * What Separate again offers: every Separation Model but the one that made the
 * Stems on disk, since running that one again would make the same Stems.
 */
export function otherSeparationModels<T extends { name: SeparationModelName }>(
  models: readonly T[],
  current: SeparationModelName | null,
): T[] {
  return models.filter(model => model.name !== current)
}

/**
 * What a Separation Model's option says of whether it is here. No model ships
 * with Akapela, so one that isn't here yet says so, and what its first use
 * will download, rather than looking ready.
 */
export function separationModelAvailability(model: { downloaded: boolean, downloadBytes: number }): string {
  return model.downloaded ? 'Downloaded' : `Not downloaded · ${formatMegabytes(model.downloadBytes)}`
}
