<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import type { QueueEntryWithTrack } from '~~/server/lib/queue'

/** One Queue Entry on the Queue page. The first is visibly the one that's up. */
const props = defineProps<{ entry: QueueEntryWithTrack, index: number, busy: boolean }>()
const emit = defineEmits<{ remove: [] }>()

const first = computed(() => props.index === 0)
</script>

<template>
  <li
    class="flex items-center gap-3 rounded-[8px] p-3"
    :class="first ? 'bg-surface-mid shadow-[0_0_0_2px_var(--color-accent)]' : 'bg-surface'"
  >
    <span
      class="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-text-muted"
      aria-hidden="true"
    >{{ index + 1 }}</span>

    <img
      :src="`/api/tracks/${entry.track.id}/cover?v=${entry.track.updatedAt}`"
      alt=""
      class="size-14 shrink-0 rounded-[6px] bg-surface-mid object-cover"
      loading="lazy"
      width="56"
      height="56"
    >

    <div class="min-w-0 flex-1">
      <p
        v-if="first"
        class="text-xs font-bold uppercase tracking-[1.4px] text-accent"
      >
        Up now
      </p>
      <p
        class="truncate text-base font-bold"
        :title="entry.track.title"
      >
        {{ entry.track.title }}
      </p>
      <p class="truncate text-sm text-text-muted">
        {{ entry.track.artist ?? 'Unknown artist' }}
      </p>
      <p
        v-if="entry.singerName"
        class="truncate text-sm font-bold text-text"
      >
        {{ entry.singerName }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <slot name="actions" />
      <button
        type="button"
        class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-negative disabled:opacity-60"
        :disabled="busy"
        :aria-label="`Remove ${entry.track.title}${entry.singerName ? ` for ${entry.singerName}` : ''} from the Queue`"
        @click="emit('remove')"
      >
        <Trash2 class="size-4" />
      </button>
    </div>
  </li>
</template>
