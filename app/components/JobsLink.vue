<script setup lang="ts">
import { ListChecks } from 'lucide-vue-next'

/**
 * The way to the Jobs page from anywhere, with a badge counting what is
 * queued or running — what makes a forty-song playlist import visible from a
 * screen that is not the Jobs page. The badge is hidden at zero, so nothing
 * new appears on an idle install. The count comes from the same shared poll
 * the Jobs page uses (`useJobs`), never a timer of its own.
 */
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' })

const { activeCount, refresh } = useJobs()

// A Job started on another screen should show here without waiting for the
// window to lose and regain focus.
const route = useRoute()
watch(() => route.path, () => void refresh())

const label = computed(() => activeCount.value === 0
  ? 'Jobs'
  : `Jobs, ${activeCount.value} queued or running`)
</script>

<template>
  <NuxtLink
    to="/jobs"
    class="relative flex shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
    :class="size === 'sm' ? 'size-9' : 'size-11'"
    :aria-label="label"
  >
    <ListChecks class="size-5" />
    <span
      v-if="activeCount > 0"
      class="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-bold leading-none text-accent-ink"
      aria-hidden="true"
    >
      {{ activeCount > 99 ? '99+' : activeCount }}
    </span>
  </NuxtLink>
</template>
