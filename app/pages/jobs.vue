<script setup lang="ts">
import { ArrowLeft, ListChecks, Loader2 } from 'lucide-vue-next'
import type { JobListEntry } from '~~/server/lib/job-actions'

useHead({ title: 'Jobs · Akapela' })

const { jobs, loaded, error, cancel, retry, clearFinished } = useJobs()

const sections = computed(() => jobSections(jobs.value))

const busyId = ref<string | null>(null)
const clearing = ref(false)
const actionError = ref<string | null>(null)

async function act(job: JobListEntry, action: (job: JobListEntry) => Promise<void>) {
  busyId.value = job.id
  actionError.value = null
  try {
    await action(job)
  }
  catch (failure) {
    actionError.value = describeError(failure)
  }
  finally {
    busyId.value = null
  }
}

async function onClearFinished() {
  clearing.value = true
  actionError.value = null
  try {
    await clearFinished()
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

    <h1 class="mb-6 text-2xl font-bold tracking-tight">
      Jobs
    </h1>

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
      v-else-if="jobs.length === 0"
      class="flex flex-col items-center gap-4 rounded-[8px] bg-surface px-6 py-12 text-center"
    >
      <ListChecks class="size-10 text-text-muted" />
      <p class="text-base text-text-muted">
        Nothing running. Imports, Separations, and Mixes show up here.
      </p>
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110"
      >
        Go to the Library
      </NuxtLink>
    </div>

    <template v-else>
      <section
        v-if="sections.running.length"
        class="mb-8"
        aria-labelledby="jobs-running"
      >
        <h2
          id="jobs-running"
          class="mb-3 text-lg font-semibold"
        >
          Running
        </h2>
        <ul class="flex flex-col gap-2">
          <JobRow
            v-for="job in sections.running"
            :key="job.id"
            :job="job"
            :busy="busyId === job.id"
            @cancel="act(job, cancel)"
          />
        </ul>
      </section>

      <section
        v-if="sections.queued.length"
        class="mb-8"
        aria-labelledby="jobs-queued"
      >
        <h2
          id="jobs-queued"
          class="mb-3 text-lg font-semibold"
        >
          Queued
        </h2>
        <ul class="flex flex-col gap-2">
          <JobRow
            v-for="job in sections.queued"
            :key="job.id"
            :job="job"
            :busy="busyId === job.id"
            @cancel="act(job, cancel)"
          />
        </ul>
      </section>

      <section
        v-if="sections.finished.length"
        aria-labelledby="jobs-finished"
      >
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="jobs-finished"
            class="text-lg font-semibold"
          >
            Finished
          </h2>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-pill border border-border-light px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text disabled:opacity-60"
            :disabled="clearing"
            @click="onClearFinished"
          >
            <Loader2
              v-if="clearing"
              class="size-3.5 animate-spin"
            />
            Clear finished
          </button>
        </div>
        <ul class="flex flex-col gap-2">
          <JobRow
            v-for="job in sections.finished"
            :key="job.id"
            :job="job"
            :busy="busyId === job.id"
            @retry="act(job, retry)"
          />
        </ul>
      </section>
    </template>
  </main>
</template>
