<script setup lang="ts">
import { ListPlus, Plus, Search, X } from 'lucide-vue-next'
import type { TrackWithJob } from '~~/server/lib/tracks'

/**
 * **Add a song** on the Queue page, so the one screen a guest is handed is
 * enough on its own. An inline search over the Library through the Library's
 * own `GET /api/tracks?q=`, so matching means exactly what it means there;
 * picking a result opens the same "Who's singing?" dialog every other way in
 * does. Nobody is sent to the Library and left to find their way back.
 *
 * Importing is the Library's job: a song that isn't there is out of reach
 * here, and the empty result says so.
 */
const open = ref(false)
const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const { ask } = useAddToQueue()

const { data, status } = useAsyncData<TrackWithJob[]>(
  'queue-add-song',
  () => $fetch<TrackWithJob[]>('/api/tracks', { query: { q: query.value || undefined } }),
  { default: () => [], watch: [query], immediate: false },
)

// A Track still importing cannot be sung, so it is not offered.
const results = computed(() => (data.value ?? []).filter(track => track.importState === 'ready'))
const searching = computed(() => status.value === 'pending')

async function show() {
  open.value = true
  query.value = ''
  await refreshNuxtData('queue-add-song')
  await nextTick()
  input.value?.focus()
}

function hide() {
  open.value = false
}
</script>

<template>
  <div class="mb-6">
    <button
      v-if="!open"
      type="button"
      class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110"
      @click="show"
    >
      <Plus class="size-4" />
      Add a song
    </button>

    <section
      v-else
      class="rounded-[8px] bg-surface p-3 shadow-[var(--shadow-medium)]"
      aria-label="Add a song from the Library"
    >
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            ref="input"
            v-model.trim="query"
            type="search"
            autocomplete="off"
            enterkeyhint="search"
            placeholder="Search the Library"
            aria-label="Search the Library for a song to add"
            class="w-full appearance-none rounded-pill bg-surface-mid py-3 pl-11 pr-4 text-base text-text shadow-[var(--shadow-inset-border)] outline-none placeholder:text-text-muted focus:shadow-[var(--shadow-inset-border),0_0_0_2px_var(--color-text)]"
            @keydown.escape="hide"
          >
        </div>
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
          aria-label="Close the search"
          @click="hide"
        >
          <X class="size-4" />
        </button>
      </div>

      <p
        v-if="!searching && results.length === 0"
        class="px-2 pb-1 pt-4 text-sm text-text-muted"
        role="status"
      >
        Nothing in the Library matches. Import it from the
        <NuxtLink
          to="/"
          class="font-bold text-text underline"
        >Library</NuxtLink> first.
      </p>

      <ul
        v-else
        class="mt-2 flex max-h-[50vh] flex-col overflow-y-auto"
        aria-label="Songs in the Library"
      >
        <li
          v-for="track in results"
          :key="track.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[6px] p-2 text-left transition hover:bg-surface-mid focus-visible:bg-surface-mid focus-visible:outline-none"
            :aria-label="`Add ${track.title} to the Queue`"
            @click="ask(track)"
          >
            <img
              :src="`/api/tracks/${track.id}/cover?v=${track.updatedAt}`"
              alt=""
              class="size-10 shrink-0 rounded-[4px] bg-surface-mid object-cover"
              loading="lazy"
              width="40"
              height="40"
            >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold">{{ track.title }}</span>
              <span class="block truncate text-xs text-text-muted">{{ track.artist ?? 'Unknown artist' }}</span>
            </span>
            <ListPlus class="size-4 shrink-0 text-text-muted" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
