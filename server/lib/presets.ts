import { randomUUID } from 'node:crypto'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { presets, type Preset } from '../db/schema'
import { DUPLICATE_PRESET_NAME_MESSAGE, type PresetCreate } from '../../shared/preset'
import type { Akapela } from './akapela'

/**
 * Every Preset, built-ins first in the order the migration seeded them, then
 * user Presets newest first — the row order `AdjustmentsPanel.vue`'s pill row
 * renders directly.
 */
export function listPresets(akapela: Akapela): Preset[] {
  const builtIns = akapela.db
    .select()
    .from(presets)
    .where(eq(presets.builtIn, true))
    .orderBy(asc(sql`${presets}.rowid`))
    .all()
  const custom = akapela.db
    .select()
    .from(presets)
    .where(eq(presets.builtIn, false))
    .orderBy(desc(presets.createdAt), desc(sql`${presets}.rowid`))
    .all()
  return [...builtIns, ...custom]
}

/** Case-insensitive so "Nightcore" and "nightcore" collide the same way a singer would expect. */
function foldName(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en')
}

/**
 * Saves the submitted Adjustments under a name. Rejects a name already taken
 * by any Preset, built-in or not, since two pills reading the same thing would
 * be confusing regardless of which one a singer made.
 */
export function createPreset(akapela: Akapela, input: PresetCreate): Preset {
  const needle = foldName(input.name)
  const clash = akapela.db.select({ name: presets.name }).from(presets).all()
    .some(row => foldName(row.name) === needle)
  if (clash) throw new Error(DUPLICATE_PRESET_NAME_MESSAGE)

  const id = randomUUID()
  const now = Date.now()
  const preset: Preset = {
    id,
    name: input.name,
    pitchSemitones: input.adjustments.pitchSemitones,
    tempoPercent: input.adjustments.tempoPercent,
    linked: input.adjustments.linked,
    reverbAmount: input.adjustments.reverbAmount,
    lowpassHz: input.adjustments.lowpassHz,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  }
  akapela.db.insert(presets).values(preset).run()
  return preset
}

/** One Preset by id, or undefined when there is none. */
export function getPreset(akapela: Akapela, id: string): Preset | undefined {
  return akapela.db.select().from(presets).where(eq(presets.id, id)).get()
}

/**
 * Deletes a user Preset. Returns false when no such Preset exists; the
 * built-in rejection is the caller's, since it needs a distinct status code
 * from "not found" (`server/api/presets/[id].delete.ts`).
 */
export function deletePreset(akapela: Akapela, id: string): boolean {
  return akapela.db.delete(presets).where(eq(presets.id, id)).returning({ id: presets.id }).all().length > 0
}
