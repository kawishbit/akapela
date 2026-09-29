<script setup lang="ts">
import { ArrowLeft, ListChecks, Loader2 } from 'lucide-vue-next'
import type { JobListEntry } from '~~/server/lib/job-actions'
import type { ErrorText } from '~/utils/errors'
import type { PlaylistImportGroup } from '~/utils/playlist-import'

const { t } = useI18n()

useHead(() => ({ title: t('app.pageTitle', { page: t('jobs.title') }) }))

const { jobs, loaded, error, cancel, retry, clearFinished, cancelPlaylistImport } = useJobs()

// A Playlist Import's Jobs are one row each; everything else is listed as it always was.
const grouped = computed(() => playlistImportGroups(jobs.value))
const sections = computed(() => jobSections(grouped.value.others))
// Clear finished clears a group's finished Jobs too, so it is offered when only they are left.
const hasFinishedInGroups = computed(() => grouped.value.groups.some(group => group.jobs.some(job => !isActiveJob(job))))

/**
 * Arriving from a Library card's chip at `/jobs#<jobId>`: scroll to that row
 * and highlight it, once the list has loaded and the row exists.
 */
const route = useRoute()
const highlightedId = computed(() => decodeURIComponent(route.hash.slice(1)) || null)
const scrolledTo = ref<string | null>(null)
watch([highlightedId, loaded, jobs], async ([id]) => {
  if (!id || scrolledTo.value === id || !jobs.value.some(job => job.id === id)) return
  scrolledTo.value = id
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}, { immediate: true })

const busyId = ref<string | null>(null)
const clearing = ref(false)
const actionError = ref<ErrorText | null>(null)

async function act(job: JobListEntry, action: (job: JobListEntry) => Promise<void>) {
  busyId.value = job.id
  actionError.value = null
  try {
    await action(job)
  }
  catch (failure) {
    actionError.value = describeError(failure, t)
  }
  finally {
    busyId.value = null
  }
}

/** The Playlist Import the singer asked to cancel, held until they confirm. */
const pendingCancel = ref<PlaylistImportGroup | null>(null)
const cancellingGroup = ref<string | null>(null)

async function confirmCancelAll() {
  const group = pendingCancel.value
  if (!group) return
  cancellingGroup.value = group.id
  actionError.value = null
  try {
    await cancelPlaylistImport(group.id)
    pendingCancel.value = null
  }
  catch (failure) {
    actionError.value = describeError(failure, t)
  }
  finally {
    cancellingGroup.value = null
  }
}

async function onClearFinished() {
  clearing.value = true
  actionError.value = null
  try {
    await clearFinished()
  }
  catch (failure) {
    actionError.value = describeError(failure, t)
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
      {{ t('common.library') }}
    </NuxtLink>

    <h1 class="mb-6 text-2xl font-bold tracking-tight">
      {{ t('jobs.title') }}
    </h1>

    <ErrorMessage
      class="mb-4"
      :error="actionError ?? error"
    />

    <div
      v-if="!loaded"
      class="flex items-center gap-2 text-sm text-text-muted"
    >
      <Loader2 class="size-4 animate-spin" />
      {{ t('jobs.loading') }}
    </div>

    <div
      v-else-if="jobs.length === 0"
      class="flex flex-col items-center gap-4 rounded-[8px] bg-surface px-6 py-12 text-center"
    >
      <ListChecks class="size-10 text-text-muted" />
      <p class="text-base text-text-muted">
        {{ t('jobs.empty') }}
      </p>
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110"
      >
        {{ t('jobs.goToLibrary') }}
      </NuxtLink>
    </div>

    <template v-else>
      <section
        v-if="grouped.groups.length"
        class="mb-8"
        aria-labelledby="jobs-playlist-imports"
      >
        <h2
          id="jobs-playlist-imports"
          class="mb-3 text-lg font-semibold"
        >
          {{ t('jobs.playlistImport.heading') }}
        </h2>
        <ul class="flex flex-col gap-2">
          <PlaylistImportRow
            v-for="group in grouped.groups"
            :key="group.id"
            :group="group"
            :busy-id="busyId"
            :cancelling="cancellingGroup === group.id"
            :highlighted-id="highlightedId"
            @cancel-all="pendingCancel = group"
            @cancel="job => act(job, cancel)"
            @retry="job => act(job, retry)"
          />
        </ul>
      </section>

      <section
        v-if="sections.running.length"
        class="mb-8"
        aria-labelledby="jobs-running"
      >
        <h2
          id="jobs-running"
          class="mb-3 text-lg font-semibold"
        >
          {{ t('jobs.running') }}
        </h2>
        <ul class="flex flex-col gap-2">
          <JobRow
            v-for="job in sections.running"
            :key="job.id"
            :job="job"
            :busy="busyId === job.id"
            :highlighted="highlightedId === job.id"
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
          {{ t('jobs.queued') }}
        </h2>
        <ul class="flex flex-col gap-2">
          <JobRow
            v-for="job in sections.queued"
            :key="job.id"
            :job="job"
            :busy="busyId === job.id"
            :highlighted="highlightedId === job.id"
            @cancel="act(job, cancel)"
          />
        </ul>
      </section>

      <section
        v-if="sections.finished.length || hasFinishedInGroups"
        aria-labelledby="jobs-finished"
      >
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="jobs-finished"
            class="text-lg font-semibold"
          >
            {{ t('jobs.finished') }}
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
            {{ t('jobs.clearFinished') }}
          </button>
        </div>
        <ul class="flex flex-col gap-2">
          <JobRow
            v-for="job in sections.finished"
            :key="job.id"
            :job="job"
            :busy="busyId === job.id"
            :highlighted="highlightedId === job.id"
            @retry="act(job, retry)"
          />
        </ul>
      </section>
    </template>

    <ConfirmDialog
      :open="pendingCancel !== null"
      :title="t('jobs.playlistImport.cancelTitle')"
      :message="pendingCancel ? t('jobs.playlistImport.cancelMessage', { name: pendingCancel.name }) : ''"
      :confirm-label="t('jobs.playlistImport.cancelAll')"
      :busy="cancellingGroup !== null"
      @confirm="confirmCancelAll"
      @cancel="pendingCancel = null"
    />
  </main>
</template>
