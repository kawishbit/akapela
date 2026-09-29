<script setup lang="ts">
import type { ErrorText } from '~/utils/errors'

/**
 * One failure, in the singer's Language. When the server had no words for it,
 * the raw text it sent sits under Details: collapsed, since it is usually
 * English or a tool's own output, but never hidden (ADR 0014).
 */
const props = defineProps<{ error: ErrorText | null }>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="props.error"
    class="text-sm text-negative"
    role="alert"
  >
    <p>{{ props.error.message }}</p>
    <details
      v-if="props.error.details"
      class="mt-1 text-text-muted"
    >
      <summary class="cursor-pointer select-none text-xs font-bold">
        {{ t('errors.details') }}
      </summary>
      <pre class="mt-1 whitespace-pre-wrap break-words font-mono text-xs">{{ props.error.details }}</pre>
    </details>
  </div>
</template>
