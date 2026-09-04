import { TakeRecorder } from '~/audio/recorder'
import { encodeWav } from '~/audio/wav'
import type { Take } from '~~/server/db/schema'
import type { Adjustments } from '~~/shared/adjustments'

const DEVICE_STORAGE_KEY = 'presto:mic-device-id'
const COUNTDOWN_SECONDS = 3

export type MicPermission = 'unrequested' | 'requesting' | 'granted' | 'denied'
export type RecordPhase = 'idle' | 'counting-down' | 'recording' | 'encoding' | 'uploading' | 'done' | 'error'

export interface TakeRecorderState {
  permission: MicPermission
  devices: MediaDeviceInfo[]
  selectedDeviceId: string | null
  processingEnabled: boolean
  monitoring: boolean
  armed: boolean
  phase: RecordPhase
  countdown: number
  levelRms: number
  levelPeak: number
  uploadProgress: number
  error: string | null
  savedTake: Take | null
}

/**
 * Records a Take on the Sing page: microphone permission and device choice,
 * the processing and Monitoring toggles, the countdown, capture through
 * `TakeRecorder`, WAV encoding, and the automatic upload. Recording and
 * Monitoring share the Backing Track's own AudioContext (`player.getAudioContext`)
 * so the vocal and the backing advance on one audio clock (ADR 0006).
 */
export function useTakeRecorder(trackId: Ref<string>) {
  const player = usePlayer()

  const state = ref<TakeRecorderState>({
    permission: 'unrequested',
    devices: [],
    selectedDeviceId: null,
    processingEnabled: false,
    monitoring: false,
    armed: false,
    phase: 'idle',
    countdown: 0,
    levelRms: 0,
    levelPeak: 0,
    uploadProgress: 0,
    error: null,
    savedTake: null,
  })

  let stream: MediaStream | undefined
  let recorder: TakeRecorder | undefined
  let monitorSource: MediaStreamAudioSourceNode | undefined
  let monitorGain: GainNode | undefined
  let countdownTimer: ReturnType<typeof setInterval> | undefined
  let startPositionMs = 0
  let recordedAdjustments: Adjustments = { ...player.state.value.adjustments }
  let pendingUpload: { wavBytes: Uint8Array, durationMs: number } | undefined

  watch(() => state.value.monitoring, (on) => {
    if (monitorGain) monitorGain.gain.value = on ? 1 : 0
  })

  /** Grants microphone access with today's constraints and lists input devices. Call once. */
  async function enableMicrophone(): Promise<void> {
    if (state.value.permission === 'requesting') return
    state.value.permission = 'requesting'
    state.value.error = null
    try {
      await openStream(loadRememberedDeviceId())
      state.value.permission = 'granted'
      await refreshDevices()
    }
    catch (e) {
      state.value.permission = 'denied'
      state.value.error = describeError(e)
    }
  }

  async function refreshDevices(): Promise<void> {
    const all = await navigator.mediaDevices.enumerateDevices()
    state.value.devices = all.filter(d => d.kind === 'audioinput')
  }

  /** Switches the input device, remembered for next time on this browser. */
  async function selectDevice(deviceId: string): Promise<void> {
    if (deviceId === state.value.selectedDeviceId || state.value.phase !== 'idle') return
    try {
      await openStream(deviceId)
      saveRememberedDeviceId(deviceId)
    }
    catch (e) {
      state.value.error = describeError(e)
    }
  }

  /** Turns echo cancellation, noise suppression, and auto gain on or off together. */
  async function setProcessing(enabled: boolean): Promise<void> {
    if (enabled === state.value.processingEnabled || state.value.phase !== 'idle') return
    state.value.processingEnabled = enabled
    if (stream) {
      try {
        await openStream(state.value.selectedDeviceId)
      }
      catch (e) {
        state.value.error = describeError(e)
      }
    }
  }

  async function openStream(deviceId?: string | null): Promise<void> {
    const audio: MediaTrackConstraints = {
      echoCancellation: state.value.processingEnabled,
      noiseSuppression: state.value.processingEnabled,
      autoGainControl: state.value.processingEnabled,
    }
    if (deviceId) audio.deviceId = { exact: deviceId }
    const next = await navigator.mediaDevices.getUserMedia({ audio })
    closeStream()
    stream = next
    state.value.selectedDeviceId = next.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId ?? null
    state.value.armed = true
  }

  function closeStream(): void {
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
    state.value.armed = false
  }

  /** Runs the countdown, starts the Backing Track, and begins capture from the current song position. */
  async function startRecording(): Promise<void> {
    if (state.value.phase !== 'idle' || !stream) return
    const context = player.getAudioContext()
    if (!context) {
      state.value.error = 'The Backing Track has not loaded yet.'
      return
    }
    state.value.error = null
    startPositionMs = player.state.value.positionMs
    recordedAdjustments = { ...player.state.value.adjustments }
    if (player.state.value.playing) player.pause()
    // A resume triggered from this click satisfies the browser's user-gesture
    // requirement; the countdown that follows runs on a timer, not a gesture.
    if (context.state !== 'running') await context.resume()

    state.value.phase = 'counting-down'
    state.value.countdown = COUNTDOWN_SECONDS
    const finishedCountdown = await new Promise<boolean>((resolve) => {
      countdownTimer = setInterval(() => {
        state.value.countdown -= 1
        if (state.value.countdown > 0) return
        clearInterval(countdownTimer)
        countdownTimer = undefined
        resolve(state.value.phase === 'counting-down')
      }, 1000)
    })
    if (!finishedCountdown || !stream) return

    recorder = new TakeRecorder({
      onLevel: (rms, peak) => {
        state.value.levelRms = rms
        state.value.levelPeak = peak
      },
      onError: (message) => {
        state.value.error = message
      },
    })
    monitorSource = context.createMediaStreamSource(stream)
    monitorGain = context.createGain()
    monitorGain.gain.value = state.value.monitoring ? 1 : 0
    monitorSource.connect(monitorGain).connect(context.destination)

    await recorder.start(context, stream)
    void player.play()
    state.value.phase = 'recording'
  }

  /** Cancels a countdown in progress without recording anything. */
  function cancelCountdown(): void {
    if (state.value.phase !== 'counting-down') return
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = undefined
    state.value.phase = 'idle'
  }

  /** Stops capture, encodes what was recorded to WAV, and uploads it. */
  async function stopRecording(): Promise<void> {
    if (state.value.phase !== 'recording' || !recorder) return
    player.pause()
    state.value.phase = 'encoding'
    const audio = await recorder.stop()
    recorder = undefined
    disconnectMonitor()
    state.value.levelRms = 0
    state.value.levelPeak = 0

    const durationMs = Math.round((audio.channels[0]!.length / audio.sampleRate) * 1000)
    const wavBytes = encodeWav(audio)
    await upload(wavBytes, durationMs)
  }

  async function upload(wavBytes: Uint8Array, durationMs: number): Promise<void> {
    state.value.phase = 'uploading'
    state.value.uploadProgress = 0
    pendingUpload = { wavBytes, durationMs }
    try {
      const take = await uploadTake(
        trackId.value,
        wavBytes,
        { startPositionMs, durationMs, adjustments: recordedAdjustments },
        (percent) => { state.value.uploadProgress = percent },
      )
      pendingUpload = undefined
      state.value.savedTake = take
      state.value.phase = 'done'
    }
    catch (e) {
      state.value.error = describeError(e)
      state.value.phase = 'error'
    }
  }

  /** Retries the upload of the last recorded Take after a failure, without re-recording. */
  function retryUpload(): void {
    if (pendingUpload) void upload(pendingUpload.wavBytes, pendingUpload.durationMs)
  }

  /** Clears a confirmation or error, ready to record again. */
  function dismiss(): void {
    state.value.phase = 'idle'
    state.value.savedTake = null
    state.value.error = null
    pendingUpload = undefined
  }

  function disconnectMonitor(): void {
    monitorSource?.disconnect()
    monitorGain?.disconnect()
    monitorSource = undefined
    monitorGain = undefined
  }

  /** Releases the microphone and any live audio nodes; call when leaving the Sing page. */
  function destroy(): void {
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = undefined
    disconnectMonitor()
    closeStream()
  }

  return {
    state,
    enableMicrophone,
    selectDevice,
    setProcessing,
    startRecording,
    cancelCountdown,
    stopRecording,
    retryUpload,
    dismiss,
    destroy,
  }
}

function loadRememberedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_STORAGE_KEY)
  }
  catch {
    return null
  }
}

function saveRememberedDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, deviceId)
  }
  catch {
    // Private browsing or storage disabled; the choice just won't stick.
  }
}

/** Uploads a Take with `XMLHttpRequest`, the only way to observe upload progress in the browser. */
function uploadTake(
  trackId: string,
  wavBytes: Uint8Array,
  meta: { startPositionMs: number, durationMs: number, adjustments: Adjustments },
  onProgress: (percent: number) => void,
): Promise<Take> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    // @types/node's Uint8Array<ArrayBufferLike> augmentation doesn't satisfy DOM's BlobPart in this TS config.
    form.append('file', new Blob([wavBytes as unknown as BlobPart], { type: 'audio/wav' }), 'take.wav')
    form.append('meta', JSON.stringify(meta))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/tracks/${trackId}/takes`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as Take)
      else reject(new Error(safeStatusMessage(xhr) ?? `The Take could not be uploaded (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('The Take could not be uploaded.'))
    xhr.send(form)
  })
}

function safeStatusMessage(xhr: XMLHttpRequest): string | undefined {
  try {
    return (JSON.parse(xhr.responseText) as { statusMessage?: string }).statusMessage
  }
  catch {
    return undefined
  }
}
