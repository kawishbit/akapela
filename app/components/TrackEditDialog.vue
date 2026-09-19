<script setup lang="ts">
import { ImagePlus, Loader2 } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'
import { TRACK_FIELD_MAX_LENGTH } from '~~/shared/track-details'

/**
 * Renames a Track and replaces its cover art. The title and artist are the
 * Track's own, what the library lists it by; the Song the Lyrics are looked up
 * by is changed in the Song panel, and nothing here touches it.
 */
const props = defineProps<{
  open: boolean
  track: TrackWithJob
}>()

/**
 * `saved` once everything went through. `changed` when the title and artist
 * were saved but the cover was then refused, so the page can show the new
 * name while the dialog stays open on the cover's error.
 */
const emit = defineEmits<{ saved: [], changed: [], cancel: [] }>()

const title = ref('')
const artist = ref('')
const coverFile = ref<File | null>(null)
const coverPreview = ref<string | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)

const titleInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function clearPreview() {
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
  coverPreview.value = null
}

watch(() => props.open, async (open) => {
  if (!open) return
  title.value = props.track.title
  artist.value = props.track.artist ?? ''
  coverFile.value = null
  clearPreview()
  error.value = null
  await nextTick()
  titleInput.value?.focus()
})
onBeforeUnmount(clearPreview)

// The import writes the Source's artwork, so the cover waits until it is done.
const coverLocked = computed(() => props.track.importState === 'importing')

const canSave = computed(() => title.value.trim().length > 0 && !saving.value)

function onPickCover(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  clearPreview()
  coverFile.value = file
  if (file) coverPreview.value = URL.createObjectURL(file)
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  let renamed = false
  try {
    const nextArtist = artist.value.trim() || null
    if (title.value.trim() !== props.track.title || nextArtist !== props.track.artist) {
      await $fetch(`/api/tracks/${props.track.id}/details`, {
        method: 'PUT',
        body: { title: title.value, artist: nextArtist },
      })
      renamed = true
    }
    if (coverFile.value) {
      const form = new FormData()
      form.append('file', coverFile.value)
      await $fetch(`/api/tracks/${props.track.id}/cover`, { method: 'PUT', body: form })
    }
    emit('saved')
  }
  catch (e) {
    error.value = describeError(e)
    if (renamed) emit('changed')
  }
  finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !saving.value) emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      @click.self="!saving && emit('cancel')"
      @keydown="onKeydown"
    >
      <form
        class="w-full max-w-md rounded-[8px] bg-card p-6 shadow-[var(--shadow-heavy)]"
        role="dialog"
        aria-modal="true"
        aria-label="Edit Track"
        @submit.prevent="save"
      >
        <h2 class="text-lg font-semibold leading-[1.3]">
          Edit Track
        </h2>

        <div class="mt-5 flex gap-4">
          <button
            type="button"
            class="group relative size-28 shrink-0 overflow-hidden rounded-[6px] bg-surface-mid disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Choose cover art"
            :disabled="coverLocked"
            :title="coverLocked ? 'Cover art can be changed once the Track has finished importing' : undefined"
            @click="fileInput?.click()"
          >
            <img
              :src="coverPreview ?? `/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
              alt=""
              class="size-full object-cover"
            >
            <span class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-xs font-bold text-text opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <ImagePlus class="size-5" />
              Change
            </span>
          </button>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden"
            @change="onPickCover"
          >

          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <label class="flex flex-col gap-1 text-xs font-bold text-text-muted">
              Title
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                required
                :maxlength="TRACK_FIELD_MAX_LENGTH"
                class="h-11 rounded-pill bg-surface-mid px-4 text-sm font-normal text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
              >
            </label>
            <label class="flex flex-col gap-1 text-xs font-bold text-text-muted">
              Artist
              <input
                v-model="artist"
                type="text"
                placeholder="Unknown artist"
                :maxlength="TRACK_FIELD_MAX_LENGTH"
                class="h-11 rounded-pill bg-surface-mid px-4 text-sm font-normal text-text placeholder:text-text-muted focus:outline-none focus:shadow-[var(--shadow-inset-border)]"
              >
            </label>
          </div>
        </div>

        <p class="mt-3 text-xs text-text-muted">
          Cover art can be a PNG, JPEG, or WebP. The Song used to find Lyrics is not changed here.
        </p>

        <p
          v-if="error"
          class="mt-3 text-sm text-negative"
          role="alert"
        >
          {{ error }}
        </p>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-pill px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text disabled:opacity-60"
            :disabled="saving"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="inline-flex items-center gap-2 rounded-pill bg-text px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-90 disabled:opacity-60"
            :disabled="!canSave"
          >
            <Loader2
              v-if="saving"
              class="size-4 animate-spin"
            />
            Save
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
