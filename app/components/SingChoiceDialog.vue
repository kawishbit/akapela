<script setup lang="ts">
import type { ErrorText } from '~/utils/errors'

/**
 * The choice an entry whose Stems are not there yet offers before anyone is
 * on the Sing screen: **Sing over the original**, or **Leave it for now**,
 * which moves the entry down one place rather than losing the request. A
 * failed Separation offers the same, worded for the failure, with the way to
 * retry it on the Track page.
 *
 * Mounted once in `app.vue`; `useSingEntry` opens it.
 */
const { t } = useI18n()
const { choosing } = useSingEntry()
const { entries, move } = useQueue()

// The Queue's own copy, as polls update it, so the percentage keeps moving.
const live = computed(() => entries.value.find(entry => entry.id === choosing.value?.id) ?? choosing.value)
const readiness = computed(() => (choosing.value ? entryReadiness(choosing.value) : 'ready'))
const index = computed(() => entries.value.findIndex(entry => entry.id === choosing.value?.id))
const last = computed(() => index.value === -1 || index.value >= entries.value.length - 1)

const busy = ref(false)
const failure = ref<ErrorText | null>(null)
const firstButton = ref<HTMLButtonElement | null>(null)

watch(choosing, async (entry) => {
  failure.value = null
  if (!entry) return
  await nextTick()
  firstButton.value?.focus()
})

function close() {
  choosing.value = null
}

async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  failure.value = null
  try {
    await action()
  }
  catch (error) {
    failure.value = describeError(error, t)
  }
  finally {
    busy.value = false
  }
}

/**
 * The original audio is what a Track sings over until its first Separation
 * succeeds. A Track being separated again may be on its old Stems, so the
 * choice is made explicit, and the Take records what was actually sung over
 * either way.
 */
function singOverOriginal() {
  const entry = choosing.value
  if (!entry) return
  return run(async () => {
    await $fetch<unknown>(`/api/tracks/${entry.trackId}/backing-source`, {
      method: 'PUT',
      body: { backingSource: 'original' },
    })
    close()
    await navigateTo(entrySingPath(entry))
  })
}

function leaveForNow() {
  const entry = choosing.value
  if (!entry) return
  return run(async () => {
    if (!last.value) await move(entry, index.value + 1)
    close()
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="choosing"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      @click.self="close"
      @keydown="onKeydown"
    >
      <div
        class="w-full max-w-sm rounded-[8px] bg-card p-6 shadow-[var(--shadow-heavy)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sing-choice-title"
        aria-describedby="sing-choice-message"
      >
        <h2
          id="sing-choice-title"
          class="text-lg font-semibold leading-[1.3]"
        >
          {{ readiness === 'failed' ? t('singChoice.failedTitle') : t('singChoice.separatingTitle') }}
        </h2>
        <p
          id="sing-choice-message"
          class="mt-2 text-sm text-text-muted"
        >
          <i18n-t
            v-if="readiness === 'failed'"
            keypath="singChoice.failedMessage"
            scope="global"
          >
            <template #title>
              {{ choosing.track.title }}
            </template>
            <template #link>
              <NuxtLink
                :to="`/tracks/${choosing.trackId}`"
                class="font-bold text-text underline"
                @click="close"
              >{{ t('singChoice.retryLink') }}</NuxtLink>
            </template>
          </i18n-t>
          <template v-else>
            {{ t('singChoice.separatingMessage', { title: choosing.track.title, progress: live?.track.separationProgress ?? 0 }) }}
          </template>
        </p>
        <ErrorMessage
          class="mt-3"
          :error="failure"
        />
        <div class="mt-6 flex flex-col gap-2">
          <button
            ref="firstButton"
            type="button"
            class="rounded-pill bg-accent px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-accent-ink transition hover:brightness-110 disabled:opacity-60"
            :disabled="busy"
            @click="singOverOriginal"
          >
            {{ t('singChoice.singOverOriginal') }}
          </button>
          <button
            type="button"
            class="rounded-pill border border-border-light px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:border-text disabled:opacity-60"
            :disabled="busy"
            @click="leaveForNow"
          >
            {{ t('singChoice.leaveForNow') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
