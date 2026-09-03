<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
}>()

const emit = defineEmits<{ confirm: [], cancel: [] }>()

const cancelButton = ref<HTMLButtonElement | null>(null)

watch(() => props.open, async (open) => {
  if (open) {
    await nextTick()
    cancelButton.value?.focus()
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      @click.self="emit('cancel')"
      @keydown="onKeydown"
    >
      <div
        class="w-full max-w-sm rounded-[8px] bg-card p-6 shadow-[var(--shadow-heavy)]"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
      >
        <h2 class="text-lg font-semibold leading-[1.3]">
          {{ title }}
        </h2>
        <p class="mt-2 text-sm text-text-muted">
          {{ message }}
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            ref="cancelButton"
            type="button"
            class="rounded-pill px-5 py-3 text-sm font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-pill bg-text px-6 py-3 text-sm font-bold uppercase tracking-[1.4px] text-ground transition hover:brightness-90 disabled:opacity-60"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
