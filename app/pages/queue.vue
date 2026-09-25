<script setup lang="ts">
import { ArrowLeft, ListMusic, Loader2 } from 'lucide-vue-next'
import type { QueueEntryWithTrack } from '~~/server/lib/queue'

useHead({ title: 'Queue · Akapela' })

const { entries, loaded, error, count, remove, clear } = useQueue({ poll: true })

const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const confirmingClear = ref(false)
const clearing = ref(false)

async function onRemove(entry: QueueEntryWithTrack) {
  busyId.value = entry.id
  actionError.value = null
  try {
    await remove(entry)
  }
  catch (failure) {
    // Another device may have taken it out first; the poll has already caught up.
    const status = (failure as { statusCode?: number }).statusCode
    if (status !== 404) actionError.value = describeError(failure)
  }
  finally {
    busyId.value = null
  }
}

async function onClear() {
  clearing.value = true
  actionError.value = null
  try {
    await clear()
    confirmingClear.value = false
  }
  catch (failure) {
    actionError.value = describeError(failure)
  }
  finally {
    clearing.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-36 pt-6 sm:pb-28 sm:pt-8">
    <NuxtLink
      to="/"
      class="mb-4 inline-flex h-11 items-center gap-2 rounded-pill pr-4 text-sm font-bold text-text-muted transition hover:text-text"
    >
      <ArrowLeft class="size-4" />
      Library
    </NuxtLink>

    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Queue
        </h1>
        <p
          v-if="count > 0"
          class="text-sm text-text-muted"
        >
          {{ count }} {{ count === 1 ? 'song' : 'songs' }} waiting
        </p>
      </div>
      <button
        v-if="count > 0"
        type="button"
        class="inline-flex items-center gap-2 rounded-pill border border-border-light px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text"
        @click="confirmingClear = true"
      >
        Clear
      </button>
    </header>

    <p
      v-if="actionError || error"
      class="mb-4 text-sm text-negative"
      role="alert"
    >
      {{ actionError ?? error }}
    </p>

    <div
      v-if="!loaded"
      class="flex items-center gap-2 text-sm text-text-muted"
    >
      <Loader2 class="size-4 animate-spin" />
      Loading…
    </div>

    <div
      v-else-if="count === 0"
      class="flex flex-col items-center gap-4 rounded-[8px] bg-surface px-6 py-12 text-center"
    >
      <ListMusic class="size-10 text-text-muted" />
      <p class="text-base text-text-muted">
        Nobody's up yet. Add a song from your Library.
      </p>
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110"
      >
        Go to the Library
      </NuxtLink>
    </div>

    <ol
      v-else
      class="flex flex-col gap-2"
      aria-label="Who sings next"
    >
      <QueueRow
        v-for="(entry, index) in entries"
        :key="entry.id"
        :entry="entry"
        :index="index"
        :busy="busyId === entry.id"
        @remove="onRemove(entry)"
      />
    </ol>

    <ConfirmDialog
      :open="confirmingClear"
      title="Clear the Queue?"
      :message="`All ${count} ${count === 1 ? 'entry' : 'entries'} will be taken off the Queue, on every device. The Tracks stay in your Library.`"
      confirm-label="Clear"
      :busy="clearing"
      @confirm="onClear"
      @cancel="confirmingClear = false"
    />
  </main>
</template>
