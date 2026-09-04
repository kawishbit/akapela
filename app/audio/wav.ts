/**
 * PCM-to-WAV, both ways. A Take is captured as raw Float32 PCM off the audio
 * thread (ADR 0006); this turns that into a 16-bit PCM WAV file for upload.
 * `decodeWav` exists for the round trip: proof that what a browser encodes
 * here is what gets read back, in tests where there is no `decodeAudioData`.
 */

const BYTES_PER_SAMPLE = 2
const RIFF_HEADER_BYTES = 44

export interface PcmAudio {
  channels: Float32Array[]
  sampleRate: number
}

/** Encodes interleaved 16-bit PCM channel data as a WAV file. */
export function encodeWav({ channels, sampleRate }: PcmAudio): Uint8Array {
  const numChannels = channels.length
  const numFrames = channels[0]?.length ?? 0
  const blockAlign = numChannels * BYTES_PER_SAMPLE
  const dataBytes = numFrames * blockAlign

  const buffer = new ArrayBuffer(RIFF_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true) // bits per sample
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = RIFF_HEADER_BYTES
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, floatToInt16(channels[ch]![frame]!), true)
      offset += BYTES_PER_SAMPLE
    }
  }

  return new Uint8Array(buffer)
}

/** The inverse of `encodeWav`, for a 16-bit PCM WAV; throws on anything else. */
export function decodeWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a WAV file')
  }

  let numChannels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = -1
  let dataBytes = 0

  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      if (view.getUint16(body, true) !== 1) throw new Error('Only PCM WAV is supported')
      numChannels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bitsPerSample = view.getUint16(body + 14, true)
    }
    else if (id === 'data') {
      dataOffset = body
      dataBytes = size
    }
    offset = body + size + (size % 2)
  }
  if (dataOffset < 0 || numChannels === 0 || bitsPerSample !== 16) {
    throw new Error('Not a 16-bit PCM WAV file')
  }

  const blockAlign = numChannels * BYTES_PER_SAMPLE
  const numFrames = Math.floor(dataBytes / blockAlign)
  const channels = Array.from({ length: numChannels }, () => new Float32Array(numFrames))
  let readAt = dataOffset
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch]![frame] = view.getInt16(readAt, true) / 0x8000
      readAt += BYTES_PER_SAMPLE
    }
  }

  return { channels, sampleRate }
}

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i))
  return text
}
