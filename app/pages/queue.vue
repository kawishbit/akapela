<script setup lang="ts">
import { ArrowLeft, ListMusic, Loader2 } from 'lucide-vue-next'
import type { QueueEntryWithTrack } from '~~/server/lib/queue'

useHead({ title: 'Queue · Akapela' })

const { entries, loaded, error, count, holding, remove, clear, move, playNext, rename, preview } = useQueue({ poll: true })

const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const confirmingClear = ref(false)
const clearing = ref(false)

/**
 * Runs one change to an entry, reporting any failure but the entry already
 * being gone: another device took it out first, and the refresh has caught up.
 */
async function act(entry: QueueEntryWithTrack, action: () => Promise<void>) {
  busyId.value = entry.id
  actionError.value = null
  try {
    await action()
  }
  catch (failure) {
    const status = (failure as { statusCode?: number }).statusCode
    if (status !== 404) actionError.value = describeError(failure)
  }
  finally {
    busyId.value = null
  }
}

/** Arrow keys on a row's handle: move it one place, and keep focus on it so the next press carries on. */
async function onKeyboardMove(entry: QueueEntryWithTrack, index: number) {
  const done = act(entry, () => move(entry, index))
  await nextTick()
  document.querySelector<HTMLElement>(`[data-queue-handle="${entry.id}"]`)?.focus()
  await done
}

/**
 * Dragging by a row's handle, with a finger or a mouse alike: pointer events
 * captured on the handle, the row shown where it would land as the pointer
 * crosses its neighbours, and one move sent when it is let go. While a row is
 * held, polls leave the list alone (`holding`), so an incoming poll never
 * snaps it out from under the finger.
 */
const list = ref<HTMLOListElement | null>(null)
const draggingId = ref<string | null>(null)

function onDragStart(entry: QueueEntryWithTrack, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const from = entries.value.findIndex(candidate => candidate.id === entry.id)
  draggingId.value = entry.id
  holding.value = true

  // The rows' boxes are only true once the last preview has rendered, so a
  // pointer that moves faster than that waits for it.
  let rendering = false
  const onMove = async (moveEvent: PointerEvent) => {
    if (rendering) return
    const rows = Array.from(list.value?.children ?? []) as HTMLElement[]
    const at = rows.findIndex(row => row.contains(handle))
    const over = rows.findIndex((row, index) => {
      if (index === at) return false
      const box = row.getBoundingClientRect()
      return moveEvent.clientY >= box.top && moveEvent.clientY <= box.bottom
    })
    if (over === -1) return
    preview(entry, over)
    rendering = true
    await nextTick()
    rendering = false
  }
  const onEnd = () => {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onEnd)
    handle.removeEventListener('pointercancel', onEnd)
    const to = entries.value.findIndex(candidate => candidate.id === entry.id)
    draggingId.value = null
    holding.value = false
    if (to !== from) void act(entry, () => move(entry, to))
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onEnd)
  handle.addEventListener('pointercancel', onEnd)
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
      ref="list"
      class="flex flex-col gap-2"
      aria-label="Who sings next"
    >
      <QueueRow
        v-for="(entry, index) in entries"
        :key="entry.id"
        :entry="entry"
        :index="index"
        :count="count"
        :busy="busyId === entry.id"
        :dragging="draggingId === entry.id"
        @remove="act(entry, () => remove(entry))"
        @play-next="act(entry, () => playNext(entry))"
        @rename="name => act(entry, () => rename(entry, name))"
        @move="index => onKeyboardMove(entry, index)"
        @drag-start="event => onDragStart(entry, event)"
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
