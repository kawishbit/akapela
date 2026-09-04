<script setup lang="ts">
import { AlertCircle, CheckCircle2, Headphones, Loader2, Mic, RotateCcw, Settings2, Square, X } from 'lucide-vue-next'

/** Owned by the Sing page, which needs `state.phase` too, to know when to hide the regular transport. */
const props = defineProps<{ recorder: ReturnType<typeof useTakeRecorder> }>()
const recorder = props.recorder
const state = recorder.state

function deviceLabel(device: MediaDeviceInfo, index: number): string {
  return device.label || `Microphone ${index + 1}`
}

function onSelectDevice(event: Event) {
  recorder.selectDevice((event.target as HTMLSelectElement).value)
}

/** A rough 0-1 read for the meter bar; peak moves it, RMS keeps it from looking silent between peaks. */
const meterFraction = computed(() => Math.min(1, Math.max(state.value.levelPeak, state.value.levelRms * 1.4)))
</script>

<template>
  <div class="flex w-full max-w-3xl flex-col items-center gap-3">
    <!-- Not yet allowed to use the microphone. -->
    <div
      v-if="state.permission !== 'granted'"
      class="flex flex-col items-center gap-2 text-center"
    >
      <button
        type="button"
        class="inline-flex h-12 items-center gap-2 rounded-pill bg-surface-mid px-6 text-sm font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card disabled:opacity-60"
        :disabled="state.permission === 'requesting'"
        @click="recorder.enableMicrophone()"
      >
        <Loader2
          v-if="state.permission === 'requesting'"
          class="size-4 animate-spin"
        />
        <Mic
          v-else
          class="size-4"
        />
        Enable microphone
      </button>
      <p
        v-if="state.permission === 'denied'"
        class="max-w-xs text-xs text-negative"
        role="alert"
      >
        {{ state.error ?? 'Microphone access was refused.' }} Allow it in the browser's site settings, then try again.
      </p>
    </div>

    <template v-else>
      <!-- Ready to record: device, processing, and Monitoring choices, then the button itself. -->
      <div
        v-if="state.phase === 'idle'"
        class="flex w-full flex-col items-center gap-3"
      >
        <div class="flex w-full flex-wrap items-center justify-center gap-2">
          <select
            v-if="state.devices.length > 1"
            class="h-10 max-w-52 truncate rounded-pill bg-surface-mid px-4 text-xs font-bold text-text focus:outline-none"
            aria-label="Microphone"
            :value="state.selectedDeviceId ?? undefined"
            @change="onSelectDevice"
          >
            <option
              v-for="(device, index) in state.devices"
              :key="device.deviceId"
              :value="device.deviceId"
            >
              {{ deviceLabel(device, index) }}
            </option>
          </select>

          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] transition"
            :class="state.processingEnabled ? 'bg-accent text-ground hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="state.processingEnabled"
            @click="recorder.setProcessing(!state.processingEnabled)"
          >
            <Settings2 class="size-3.5" />
            Processing {{ state.processingEnabled ? 'on' : 'off' }}
          </button>

          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] transition"
            :class="state.monitoring ? 'bg-accent text-ground hover:brightness-110' : 'bg-surface-mid text-text-muted hover:text-text'"
            :aria-pressed="state.monitoring"
            @click="state.monitoring = !state.monitoring"
          >
            <Headphones class="size-3.5" />
            Monitoring {{ state.monitoring ? 'on' : 'off' }}
          </button>
        </div>

        <button
          type="button"
          class="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-ground shadow-[var(--shadow-medium)] transition hover:brightness-110"
          aria-label="Record a Take"
          @click="recorder.startRecording()"
        >
          <Mic class="size-6" />
        </button>
      </div>

      <!-- Counting down before the Backing Track and capture both start. -->
      <div
        v-else-if="state.phase === 'counting-down'"
        class="flex flex-col items-center gap-2"
      >
        <p class="text-5xl font-bold tabular-nums text-text">
          {{ state.countdown }}
        </p>
        <button
          type="button"
          class="inline-flex h-10 items-center rounded-pill px-5 text-xs font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
          @click="recorder.cancelCountdown()"
        >
          Cancel
        </button>
      </div>

      <!-- Recording: a live level meter and the Stop button. -->
      <div
        v-else-if="state.phase === 'recording'"
        class="flex w-full flex-col items-center gap-3"
      >
        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[1.4px] text-accent">
          <span
            class="size-2 animate-pulse rounded-full bg-accent"
            aria-hidden="true"
          />
          Recording
        </div>
        <div
          class="h-2 w-full max-w-xs overflow-hidden rounded-pill bg-surface-mid"
          role="meter"
          aria-label="Microphone level"
          :aria-valuenow="Math.round(meterFraction * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-pill bg-accent transition-[width] duration-75"
            :class="{ 'bg-negative': meterFraction > 0.95 }"
            :style="{ width: `${Math.round(meterFraction * 100)}%` }"
          />
        </div>
        <button
          type="button"
          class="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-ground shadow-[var(--shadow-medium)] transition hover:brightness-110"
          aria-label="Stop recording"
          @click="recorder.stopRecording()"
        >
          <Square
            class="size-6"
            fill="currentColor"
          />
        </button>
      </div>

      <!-- Encoding and uploading: nothing to do but wait and show it happening. -->
      <div
        v-else-if="state.phase === 'encoding' || state.phase === 'uploading'"
        class="flex w-full max-w-xs flex-col items-center gap-2"
      >
        <p class="flex items-center gap-2 text-sm font-bold text-text">
          <Loader2 class="size-4 animate-spin" />
          {{ state.phase === 'encoding' ? 'Preparing the Take…' : 'Saving the Take…' }}
        </p>
        <div
          v-if="state.phase === 'uploading'"
          class="h-1.5 w-full overflow-hidden rounded-pill bg-surface-mid"
          role="progressbar"
          :aria-valuenow="state.uploadProgress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full rounded-pill bg-accent transition-[width] duration-300"
            :style="{ width: `${state.uploadProgress}%` }"
          />
        </div>
      </div>

      <!-- Saved: a quiet confirmation, dismissed to record another Take. -->
      <div
        v-else-if="state.phase === 'done'"
        class="flex items-center gap-3 rounded-pill bg-surface-mid py-2 pl-4 pr-2"
      >
        <CheckCircle2 class="size-4 shrink-0 text-accent" />
        <p class="text-sm font-bold text-text">
          Take saved
        </p>
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:text-text"
          aria-label="Record another Take"
          @click="recorder.dismiss()"
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- Failed to upload: the recording is still in memory, so retry costs nothing. -->
      <div
        v-else-if="state.phase === 'error'"
        class="flex flex-col items-center gap-2 text-center"
      >
        <p class="flex items-center gap-2 text-sm text-negative">
          <AlertCircle class="size-4 shrink-0" />
          {{ state.error }}
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-pill bg-surface-mid px-5 text-xs font-bold uppercase tracking-[1.4px] text-text transition hover:bg-card"
            @click="recorder.retryUpload()"
          >
            <RotateCcw class="size-3.5" />
            Retry
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center rounded-pill px-4 text-xs font-bold uppercase tracking-[1.4px] text-text-muted transition hover:text-text"
            @click="recorder.dismiss()"
          >
            Discard
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
