<script setup lang="ts">
import { Loader2, Plus } from 'lucide-vue-next'
import { failure } from '~~/shared/error-codes'
import { youtubeVideoId } from '~~/shared/youtube'
import type { ErrorText } from '~/utils/errors'

/**
 * Retrying a Playlist Import's Track that found nothing on YouTube: the singer
 * pastes a link to the song, and the import runs again from the download,
 * then fetches its Lyrics and separates it as the rest of the playlist did.
 * Searching again would only find nothing again, so it is not offered.
 */
const props = defineProps<{ trackId: string, title: string, compact?: boolean }>()
const emit = defineEmits<{ retried: [] }>()

const { t } = useI18n()
const url = ref('')
const busy = ref(false)
const error = ref<ErrorText | null>(null)
const inputId = useId()

async function submit() {
  if (!youtubeVideoId(url.value)) {
    error.value = describeFailure(failure('invalidYoutubeUrl'), null, t)
    return
  }
  busy.value = true
  error.value = null
  try {
    await $fetch(`/api/tracks/${props.trackId}/retry`, { method: 'POST', body: { url: url.value } })
    url.value = ''
    emit('retried')
  }
  catch (e) {
    error.value = describeError(e, t)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form
    class="relative flex flex-col gap-2"
    novalidate
    @submit.prevent="submit"
  >
    <label
      :for="inputId"
      :class="compact ? 'sr-only' : 'text-sm font-bold'"
    >
      {{ t('youtubeLink.label', { title }) }}
    </label>
    <div
      class="flex gap-2"
      :class="compact ? 'flex-col' : 'flex-col sm:flex-row'"
    >
      <input
        :id="inputId"
        v-model.trim="url"
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="https://youtu.be/"
        class="min-w-0 flex-1 appearance-none rounded-pill bg-surface-mid px-4 py-2 text-sm text-text shadow-[var(--shadow-inset-border)] outline-none placeholder:text-text-muted focus:shadow-[var(--shadow-inset-border),0_0_0_2px_var(--color-text)]"
        :aria-invalid="error !== null"
        @click.stop
      >
      <button
        type="submit"
        class="inline-flex shrink-0 items-center justify-center gap-2 rounded-pill bg-surface-mid px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
        :disabled="busy || !url"
      >
        <Loader2
          v-if="busy"
          class="size-3.5 animate-spin"
        />
        <Plus
          v-else
          class="size-3.5"
        />
        {{ t('youtubeLink.import') }}
      </button>
    </div>
    <ErrorMessage :error="error" />
  </form>
</template>
