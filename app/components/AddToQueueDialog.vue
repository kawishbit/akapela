<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import type { ErrorText } from '~/utils/errors'

/**
 * "Who's singing?" — one optional field. Enter adds with the name; Escape
 * adds with none, since the common case is someone who just wants their song
 * on. The field starts empty every time: the next person is a different
 * person. Its shape (teleported, modal, focus on open) follows
 * `ConfirmDialog.vue` rather than inventing a second dialog idiom.
 */
const { t } = useI18n()
const { pending, confirmation, cancel } = useAddToQueue()
const { add: addEntry } = useQueue()

const name = ref('')
const input = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const failure = ref<ErrorText | null>(null)

watch(pending, async (track) => {
  if (!track) return
  name.value = ''
  failure.value = null
  await nextTick()
  input.value?.focus()
})

async function add(singerName: string) {
  if (busy.value) return
  busy.value = true
  failure.value = null
  try {
    const track = pending.value
    if (!track) return
    await addEntry(track.id, singerName.trim() || null)
    pending.value = null
    confirmation.value = t('addToQueue.added', { title: track.title })
  }
  catch (error) {
    failure.value = describeError(error, t)
  }
  finally {
    busy.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  void add('')
}

// The confirmation is quiet and brief: the header count has already moved.
let hide: ReturnType<typeof setTimeout> | undefined
watch(confirmation, (message) => {
  if (hide) clearTimeout(hide)
  if (message) hide = setTimeout(() => (confirmation.value = null), 2500)
})
onBeforeUnmount(() => hide && clearTimeout(hide))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pending"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      @click.self="cancel"
      @keydown="onKeydown"
    >
      <form
        class="w-full max-w-sm rounded-[8px] bg-card p-6 shadow-[var(--shadow-heavy)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-queue-title"
        @submit.prevent="add(name)"
      >
        <h2
          id="add-to-queue-title"
          class="text-lg font-semibold leading-[1.3]"
        >
          {{ t('addToQueue.title') }}
        </h2>
        <p class="mt-1 truncate text-sm text-text-muted">
          {{ pending.title }}
        </p>
        <label
          for="add-to-queue-name"
          class="mt-4 block text-sm font-bold"
        >
          {{ t('addToQueue.who') }}
        </label>
        <input
          id="add-to-queue-name"
          ref="input"
          v-model="name"
          type="text"
          autocomplete="off"
          maxlength="80"
          :placeholder="t('addToQueue.optional')"
          class="mt-2 w-full appearance-none rounded-pill bg-surface-mid px-5 py-3 text-base text-text shadow-[var(--shadow-inset-border)] outline-none placeholder:text-text-muted focus:shadow-[var(--shadow-inset-border),0_0_0_2px_var(--color-text)]"
          aria-describedby="add-to-queue-hint"
        >
        <p
          id="add-to-queue-hint"
          class="mt-2 text-xs text-text-muted"
        >
          {{ t('addToQueue.hint') }}
        </p>
        <ErrorMessage
          class="mt-3"
          :error="failure"
        />
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-pill px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
            @click="cancel"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="submit"
            class="rounded-pill bg-accent px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
            :disabled="busy"
          >
            {{ t('addToQueue.add') }}
          </button>
        </div>
      </form>
    </div>

    <div
      class="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <p
        v-if="confirmation"
        class="inline-flex items-center gap-2 rounded-pill bg-text px-4 py-2 text-sm font-bold text-ground shadow-[var(--shadow-heavy)]"
      >
        <Check class="size-4" />
        {{ confirmation }}
      </p>
    </div>
  </Teleport>
</template>
