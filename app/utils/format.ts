import { LOWPASS_HZ_MAX } from '~~/shared/adjustments'

/** Formats a duration in milliseconds as `m:ss`, or `h:mm:ss` from one hour up. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--:--'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minutesAndSeconds = `${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds).padStart(2, '0')}`
  return hours ? `${hours}:${minutesAndSeconds}` : minutesAndSeconds
}

/**
 * `value` to exactly `digits` decimals, written with the chosen Language's
 * decimal mark (Indonesian writes `1,5`) and no digit grouping. The functions
 * below that show a fraction take the Language's `locale` for this.
 */
function decimal(value: number, digits: number, locale: string): string {
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
}

/** A pitch shift in semitones with its sign, to one decimal when it is not a whole semitone. */
export function formatPitch(semitones: number, locale: string): string {
  const whole = Number.isInteger(semitones)
  const rounded = whole ? semitones : Number(semitones.toFixed(1))
  const text = whole ? String(Math.abs(rounded)) : decimal(Math.abs(rounded), 1, locale)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${text} st`
}

/** A Lyrics Offset in seconds with its sign, always to one decimal, since it moves in tenths. */
export function formatLyricsOffset(offsetMs: number, locale: string): string {
  const seconds = offsetMs / 1000
  return `${offsetMs > 0 ? '+' : offsetMs < 0 ? '-' : ''}${decimal(Math.abs(seconds), 1, locale)} s`
}

/** A tempo as a percentage of the original. */
export function formatTempo(percent: number): string {
  return `${percent}%`
}

/** A reverb amount, the dry/wet crossfade percentage. */
export function formatReverbAmount(amount: number): string {
  return `${amount}%`
}

/** A low-pass cutoff in Hz; its top of range reads as `off` (the word for "Off") since that bypasses the filter. */
export function formatLowpassHz(hz: number, off: string, locale: string): string {
  if (hz >= LOWPASS_HZ_MAX) return off
  return hz >= 1000 ? `${decimal(hz / 1000, hz % 1000 === 0 ? 0 : 1, locale)} kHz` : `${hz} Hz`
}

/** A latency nudge in milliseconds with its sign, since it moves the vocal earlier or later. */
export function formatLatencyNudge(nudgeMs: number): string {
  const sign = nudgeMs > 0 ? '+' : nudgeMs < 0 ? '-' : ''
  return `${sign}${Math.abs(nudgeMs)} ms`
}

/** A linear gain multiplier as a percentage of unity, matching the Tempo readout's style. */
export function formatGain(gain: number): string {
  return `${Math.round(gain * 100)}%`
}

/** A byte count as megabytes, the unit Stems land in (ADR 0005 puts a pair at about 80 MB). */
export function formatMegabytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024)
  return mb < 10 ? `${decimal(mb, 1, locale)} MB` : `${decimal(Math.round(mb), 0, locale)} MB`
}

/**
 * A timestamp such as a Take's `createdAt`, written the way the chosen Language
 * writes dates (not the browser's locale), in the device's own time zone.
 */
export function formatDate(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
