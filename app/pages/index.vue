<script setup lang="ts">
import { Activity, CheckCircle2, Loader2, Music2, XCircle } from 'lucide-vue-next'

const { job, busy, failure, elapsedMs, run } = useNoopJob()

const statusLabel = computed(() => {
  if (failure.value) return 'Unreachable'
  if (!job.value) return 'Not checked'
  return job.value.state
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 pb-24 pt-8">
    <header class="mb-8 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold tracking-tight">
        Your Library
      </h1>
      <span class="rounded-[2px] bg-surface-mid px-2 py-1 text-[10.5px] font-semibold capitalize leading-[1.33] text-text-muted">
        Presto
      </span>
    </header>

    <section
      class="flex flex-col items-center justify-center rounded-[8px] bg-surface px-6 py-16 text-center shadow-[var(--shadow-medium)]"
    >
      <div class="mb-5 flex size-20 items-center justify-center rounded-full bg-surface-mid">
        <Music2 class="size-9 text-text-muted" />
      </div>
      <h2 class="text-lg font-semibold">
        Nothing to sing yet
      </h2>
      <p class="mt-2 max-w-sm text-sm text-text-muted">
        Importing from YouTube or a file arrives with the next update. Until then, this page proves the plumbing works.
      </p>
    </section>

    <section class="mt-6 rounded-[8px] bg-surface p-5 shadow-[var(--shadow-medium)]">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-full bg-surface-mid">
            <Loader2
              v-if="busy"
              class="size-5 animate-spin text-accent"
            />
            <CheckCircle2
              v-else-if="job?.state === 'succeeded'"
              class="size-5 text-accent"
            />
            <XCircle
              v-else-if="failure || job?.state === 'failed'"
              class="size-5 text-negative"
            />
            <Activity
              v-else
              class="size-5 text-text-muted"
            />
          </div>
          <div>
            <p class="text-sm font-bold">
              Worker
            </p>
            <p class="text-xs text-text-muted">
              <span class="capitalize">{{ statusLabel }}</span>
              <span v-if="elapsedMs !== null"> · {{ elapsedMs }} ms round trip</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-pill bg-accent px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-110 disabled:opacity-60"
          :disabled="busy"
          @click="run"
        >
          Check worker
        </button>
      </div>
      <p
        v-if="failure"
        class="mt-4 rounded-[6px] bg-surface-mid p-3 text-xs text-negative"
      >
        {{ failure }}
      </p>
      <p
        v-else-if="job?.state === 'failed'"
        class="mt-4 whitespace-pre-wrap rounded-[6px] bg-surface-mid p-3 font-mono text-xs text-negative"
      >
        {{ job.error }}
      </p>
    </section>
  </main>
</template>
