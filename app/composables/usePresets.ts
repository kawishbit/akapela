import type { Preset } from '~~/server/db/schema'
import type { Adjustments } from '~~/shared/adjustments'

/**
 * The global list of Presets (ticket 08): built-ins first, then user Presets
 * newest first, exactly as `GET /api/presets` orders them. One fetch shared
 * by every `AdjustmentsPanel`, since the list is the same regardless of which
 * Track's panel is open.
 */
export function usePresets() {
  const { data: list, refresh } = useAsyncData<Preset[]>(
    'presets',
    () => $fetch<Preset[]>('/api/presets'),
    { default: () => [] },
  )

  const saving = ref(false)
  const saveError = ref<string | null>(null)

  async function save(name: string, adjustments: Adjustments): Promise<boolean> {
    saving.value = true
    saveError.value = null
    try {
      await $fetch('/api/presets', { method: 'POST', body: { name, adjustments } })
      await refresh()
      return true
    }
    catch (e) {
      saveError.value = describeError(e)
      return false
    }
    finally {
      saving.value = false
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/presets/${id}`, { method: 'DELETE' })
      await refresh()
      return true
    }
    catch (e) {
      saveError.value = describeError(e)
      return false
    }
  }

  return { list, saving, saveError, save, remove }
}
