import type { SeparationModelName } from '~~/server/lib/separators/models'

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
