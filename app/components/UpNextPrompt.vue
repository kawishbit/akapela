<script setup lang="ts">
import { Mic2 } from 'lucide-vue-next'

/**
 * Up next: when a turn ends and the Queue is not empty, whoever is first is
 * offered — and only offered. **Sing** opens their Sing screen; **Not now**
 * dismisses this and leaves the Queue exactly as it is. Nothing starts on its
 * own: no countdown, no autoplay.
 *
 * Shown where the turn ended: on Review after a Take (`recorded`), or on the
 * Track page after leaving the Sing screen without recording.
 */
const props = defineProps<{ trackId: string, recorded: boolean }>()

const { t } = useI18n()

const ended = useState<EndedTurn | null>('akapela-turn-ended', () => null)
const { entries, refresh } = useQueue()
const { sing } = useSingEntry()

const first = computed(() => entries.value[0] ?? null)
const showing = computed(() =>
  first.value !== null
  && ended.value?.trackId === props.trackId
  && ended.value.recorded === props.recorded)

const busy = ref(false)

/**
 * The Queue is read again first: another device may have taken this entry out,
 * or put someone ahead of it, since the last look. Then the prompt simply
 * offers whoever is first now, rather than opening a turn that is gone.
 */
async function onSing() {
  const offered = first.value
  if (!offered || busy.value) return
  busy.value = true
  try {
    await refresh()
    const now = first.value
    if (now?.id !== offered.id) return
    // A choice about Stems that are not there yet ends the offer too: it is
    // made in the dialog, and Leave it for now moves this entry down.
    ended.value = null
    await sing(now)
  }
  finally {
    busy.value = false
  }
}

function notNow() {
  ended.value = null
}

// The offer belongs to the moment the turn ended. Once the singer moves on
// from where it was made, it is over, and coming back here later offers
// nothing.
onBeforeUnmount(() => {
  if (ended.value?.trackId === props.trackId && ended.value.recorded === props.recorded) ended.value = null
})
</script>

<template>
  <section
    v-if="showing && first"
    class="mb-6 flex flex-wrap items-center gap-3 rounded-[8px] bg-surface-mid p-4 shadow-[0_0_0_2px_var(--color-accent)]"
    aria-labelledby="up-next-label"
  >
    <p
      id="up-next-label"
      class="min-w-0 flex-1 text-base"
    >
      <span class="font-bold">{{ t('upNext.label') }}</span>
      {{ upNextLabel(first) }}
    </p>
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-pill px-4 py-2 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
        @click="notNow"
      >
        {{ t('upNext.notNow') }}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-2 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
        :disabled="busy"
        @click="onSing"
      >
        <Mic2 class="size-4" />
        {{ t('common.sing') }}
      </button>
    </div>
  </section>
</template>
