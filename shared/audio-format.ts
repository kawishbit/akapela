/**
 * Audio Format: what the Backing Track master and the Stems are stored as
 * (ADR 0016). Chosen in Settings and applied to each file as it is written, so
 * a library holds whatever mix of formats its history left it — every reader
 * takes the file as it finds it. Takes, Mixes, and the original audio are
 * never affected.
 *
 * Shared because Settings shows the same list the server accepts.
 */

export const AUDIO_FORMATS = ['wav', 'flac', 'mp3'] as const
export type AudioFormat = (typeof AUDIO_FORMATS)[number]

export const DEFAULT_AUDIO_FORMAT: AudioFormat = 'wav'

export const AUDIO_FORMAT_LABELS: Record<AudioFormat, string> = {
  wav: 'WAV',
  flac: 'FLAC',
  mp3: 'MP3',
}

export function isAudioFormat(value: unknown): value is AudioFormat {
  return typeof value === 'string' && (AUDIO_FORMATS as readonly string[]).includes(value)
}

export const INVALID_AUDIO_FORMAT_MESSAGE = `An Audio Format is one of ${AUDIO_FORMATS.join(', ')}.`
