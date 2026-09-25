<script setup lang="ts">
import { ListMusic } from 'lucide-vue-next'

/**
 * The way to the Queue page, with how many entries are waiting. Unlike the
 * Jobs badge the count shows whenever the Queue is not empty — who's next is
 * the thing people want to glance at. It never polls: it asks on arrival, on
 * every navigation, and on focus (`useQueue`).
 */
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' })

const { count, refresh } = useQueue()

const route = useRoute()
watch(() => route.fullPath, () => void refresh())

const label = computed(() => {
  if (count.value === 0) return 'Queue'
  return `Queue, ${count.value} ${count.value === 1 ? 'entry' : 'entries'}`
})
</script>

<template>
  <NuxtLink
    to="/queue"
    class="relative flex shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-mid hover:text-text"
    :class="size === 'sm' ? 'size-9' : 'size-11'"
    :aria-label="label"
  >
    <ListMusic class="size-5" />
    <span
      v-if="count > 0"
      class="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-text px-1 text-[11px] font-bold leading-none text-ground"
      aria-hidden="true"
    >
      {{ count > 99 ? '99+' : count }}
    </span>
  </NuxtLink>
</template>
