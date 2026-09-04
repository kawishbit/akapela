<script setup lang="ts">
const route = useRoute()

// The Sing page fills the screen with Lyrics and carries its own transport.
const showPlayerBar = computed(() => route.meta.playerBar !== false)
</script>

<template>
  <div class="min-h-dvh bg-ground text-text">
    <NuxtPage />
    <PlayerBar v-if="showPlayerBar" />
  </div>
</template>
