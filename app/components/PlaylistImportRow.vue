<script setup lang="ts">
import { ChevronDown, ListMusic, Loader2, X, XCircle } from 'lucide-vue-next'
import type { JobListEntry } from '~~/server/lib/job-actions'
import type { PlaylistImportGroup } from '~/utils/playlist-import'

/**
 * One Playlist Import on the Jobs page: its name and how far it has got, as
 * one row that opens into its Jobs, shown as any Job is. Cancel all cancels
 * every one of them still queued or running.
 */
const props = defineProps<{
  group: PlaylistImportGroup
  busyId: string | null
  cancelling: boolean
  highlightedId: string | null
}>()
const emit = defineEmits<{ cancelAll: [], cancel: [job: JobListEntry], retry: [job: JobListEntry] }>()

const { t } = useI18n()

// Open on arrival when a Job in it is the one the page was sent to.
const open = ref(props.group.jobs.some(job => job.id === props.highlightedId))
watch(() => props.highlightedId, (id) => {
  if (id && props.group.jobs.some(job => job.id === id)) open.value = true
})

const listId = useId()
</script>

<template>
  <li class="rounded-[8px] bg-surface">
    <div class="flex items-center gap-3 p-3">
      <div class="flex size-14 shrink-0 items-center justify-center rounded-[6px] bg-surface-mid">
        <Loader2
          v-if="group.active"
          class="size-6 animate-spin text-accent"
        />
        <ListMusic
          v-else
          class="size-6 text-text-muted"
        />
      </div>

      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-bold uppercase tracking-[1.4px] text-text-muted">
          {{ t('jobs.playlistImport.eyebrow') }}
        </p>
        <p
          class="truncate text-base font-bold"
          :title="group.name"
        >
          {{ group.name }}
        </p>
        <p class="text-sm text-text-muted">
          {{ t('jobs.playlistImport.progress', { imported: group.imported, separated: group.separated, songs: group.songs }) }}
        </p>
        <p
          v-if="group.failed"
          class="mt-0.5 flex items-center gap-1.5 text-sm text-negative"
        >
          <XCircle class="size-3.5 shrink-0" />
          {{ t('jobs.playlistImport.failed', { count: group.failed }) }}
        </p>
      </div>

      <div class="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        <button
          v-if="group.active"
          type="button"
          class="inline-flex items-center gap-2 rounded-pill border border-border-light px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text disabled:opacity-60"
          :disabled="cancelling"
          :aria-label="t('jobs.playlistImport.cancelAllLabel', { name: group.name })"
          @click="emit('cancelAll')"
        >
          <Loader2
            v-if="cancelling"
            class="size-3.5 animate-spin"
          />
          <X
            v-else
            class="size-3.5"
          />
          <span class="hidden sm:inline">{{ t('jobs.playlistImport.cancelAll') }}</span>
        </button>
        <button
          type="button"
          class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
          :aria-expanded="open"
          :aria-controls="listId"
          :aria-label="open ? t('jobs.playlistImport.hide') : t('jobs.playlistImport.show')"
          @click="open = !open"
        >
          <ChevronDown
            class="size-5 transition-transform"
            :class="{ 'rotate-180': open }"
          />
        </button>
      </div>
    </div>

    <ul
      v-show="open"
      :id="listId"
      class="flex flex-col gap-1 border-t border-surface-mid py-1"
    >
      <JobRow
        v-for="job in group.jobs"
        :key="job.id"
        :job="job"
        :busy="busyId === job.id"
        :highlighted="highlightedId === job.id"
        @cancel="emit('cancel', job)"
        @retry="emit('retry', job)"
      />
    </ul>
  </li>
</template>
