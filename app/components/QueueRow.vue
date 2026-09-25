<script setup lang="ts">
import { ChevronsUp, GripVertical, Pencil, Trash2 } from 'lucide-vue-next'
import type { QueueEntryWithTrack } from '~~/server/lib/queue'

/**
 * One Queue Entry on the Queue page. The first is visibly the one that's up.
 *
 * The handle is how an entry moves: dragged with a finger or a mouse (the
 * page does the dragging, since it needs every row), or focused and moved
 * with the arrow keys, so reordering is never mouse-only.
 */
const props = defineProps<{
  entry: QueueEntryWithTrack
  index: number
  count: number
  busy: boolean
  dragging?: boolean
}>()
const emit = defineEmits<{
  'remove': []
  'play-next': []
  'rename': [singerName: string]
  'move': [index: number]
  'drag-start': [event: PointerEvent]
}>()

const first = computed(() => props.index === 0)
const who = computed(() => props.entry.singerName ? ` for ${props.entry.singerName}` : '')

function onHandleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp' && props.index > 0) {
    event.preventDefault()
    emit('move', props.index - 1)
  }
  else if (event.key === 'ArrowDown' && props.index < props.count - 1) {
    event.preventDefault()
    emit('move', props.index + 1)
  }
}

/** Editing the singer's name in place, for the typo or the person who arrived. */
const editing = ref(false)
const draft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

async function startEditing() {
  draft.value = props.entry.singerName ?? ''
  editing.value = true
  await nextTick()
  nameInput.value?.select()
}

function finishEditing(save: boolean) {
  if (!editing.value) return
  editing.value = false
  if (save && draft.value.trim() !== (props.entry.singerName ?? '')) emit('rename', draft.value)
}
</script>

<template>
  <li
    class="flex items-center gap-2 rounded-[8px] p-2 sm:gap-3 sm:p-3"
    :class="[
      first ? 'bg-surface-mid shadow-[0_0_0_2px_var(--color-accent)]' : 'bg-surface',
      dragging ? 'relative z-10 opacity-90 shadow-[var(--shadow-heavy)]' : '',
    ]"
  >
    <button
      type="button"
      :data-queue-handle="entry.id"
      class="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text active:cursor-grabbing"
      :aria-label="`Move ${entry.track.title}${who}, number ${index + 1} of ${count}. Use the arrow keys, or drag.`"
      @pointerdown="emit('drag-start', $event)"
      @keydown="onHandleKeydown"
    >
      <GripVertical class="size-4" />
    </button>

    <img
      :src="`/api/tracks/${entry.track.id}/cover?v=${entry.track.updatedAt}`"
      alt=""
      class="size-12 shrink-0 rounded-[6px] bg-surface-mid object-cover sm:size-14"
      loading="lazy"
      width="56"
      height="56"
      draggable="false"
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
      <input
        v-if="editing"
        ref="nameInput"
        v-model="draft"
        type="text"
        maxlength="80"
        autocomplete="off"
        placeholder="Who's singing?"
        class="mt-1 w-full max-w-48 appearance-none rounded-pill bg-card px-3 py-1 text-sm text-text shadow-[var(--shadow-inset-border)] outline-none focus:shadow-[var(--shadow-inset-border),0_0_0_2px_var(--color-text)]"
        :aria-label="`Who's singing ${entry.track.title}`"
        @keydown.enter.prevent="finishEditing(true)"
        @keydown.escape.prevent="finishEditing(false)"
        @blur="finishEditing(true)"
      >
      <button
        v-else
        type="button"
        class="group/name -ml-1 inline-flex max-w-full items-center gap-1.5 rounded-pill px-1 text-sm transition hover:text-text"
        :class="entry.singerName ? 'font-bold text-text' : 'text-text-muted'"
        :aria-label="entry.singerName ? `Rename ${entry.singerName}` : `Add who's singing ${entry.track.title}`"
        @click="startEditing"
      >
        <span class="truncate">{{ entry.singerName ?? 'Add a name' }}</span>
        <Pencil class="size-3 shrink-0 opacity-60 group-hover/name:opacity-100" />
      </button>
    </div>

    <div class="flex shrink-0 items-center">
      <slot name="actions" />
      <button
        v-if="!first"
        type="button"
        class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-text disabled:opacity-60"
        :disabled="busy"
        :aria-label="`Play ${entry.track.title}${who} next`"
        title="Play next"
        @click="emit('play-next')"
      >
        <ChevronsUp class="size-4" />
      </button>
      <button
        type="button"
        class="flex size-10 items-center justify-center rounded-full text-text-muted transition hover:bg-card hover:text-negative disabled:opacity-60"
        :disabled="busy"
        :aria-label="`Remove ${entry.track.title}${who} from the Queue`"
        title="Remove"
        @click="emit('remove')"
      >
        <Trash2 class="size-4" />
      </button>
    </div>
  </li>
</template>
