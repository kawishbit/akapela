import { readFileSync } from 'node:fs'

interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  dataOffset: number
  dataLength: number
}

function readWavInfo(buffer: Buffer): WavInfo {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file')
  }
  let offset = 12
  let fmt: { channels: number, sampleRate: number, bitsPerSample: number } | undefined
  let data: { offset: number, length: number } | undefined
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      fmt = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      }
    }
    else if (id === 'data') {
      data = { offset: body, length: size }
    }
    offset = body + size + (size % 2) // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error('WAV file is missing its fmt or data chunk')
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, dataOffset: data.offset, dataLength: data.length }
}

/** Root-mean-square amplitude of a 16-bit PCM WAV between two timestamps, across channels. */
export function rmsWindow(path: string, startSeconds: number, endSeconds: number): number {
  const buffer = readFileSync(path)
  const info = readWavInfo(buffer)
  if (info.bitsPerSample !== 16) throw new Error(`expected 16-bit PCM, got ${info.bitsPerSample}-bit`)

  const bytesPerFrame = info.channels * 2
  const totalFrames = Math.floor(info.dataLength / bytesPerFrame)
  const startFrame = Math.max(0, Math.round(startSeconds * info.sampleRate))
  const endFrame = Math.min(totalFrames, Math.round(endSeconds * info.sampleRate))
  if (endFrame <= startFrame) return 0

  let sumSquares = 0
  let count = 0
  for (let frame = startFrame; frame < endFrame; frame++) {
    for (let channel = 0; channel < info.channels; channel++) {
      const sample = buffer.readInt16LE(info.dataOffset + frame * bytesPerFrame + channel * 2)
      sumSquares += sample * sample
      count++
    }
  }
  return count === 0 ? 0 : Math.sqrt(sumSquares / count)
}

/** Duration of a WAV file, in seconds, from its own data chunk (independent of ffprobe). */
export function wavDurationSeconds(path: string): number {
  const buffer = readFileSync(path)
  const info = readWavInfo(buffer)
  const bytesPerFrame = info.channels * (info.bitsPerSample / 8)
  return info.dataLength / bytesPerFrame / info.sampleRate
}
