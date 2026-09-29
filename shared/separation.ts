/**
 * What a singer can say about how a Separation runs, shared because Settings
 * shows the same numbers the server enforces. Every choice here describes the
 * machine hosting Akapela, not the device looking at it (ADR 0013 amendment):
 * a Connected Desktop App on a laptop shows the server's cores.
 */

/**
 * All cores but one, so whatever else the machine is doing — a browser
 * recording a Take, most often — always has one to itself. Never less than
 * one, or a one-core machine could never separate.
 */
export function defaultCpuCores(hostCores: number): number {
  return Math.max(1, hostCores - 1)
}

/**
 * The cores a Separation actually gets: the singer's choice, or the default
 * when they never made one, clamped to this machine. A choice saved on bigger
 * hardware — a library restored onto a smaller server — is kept as it was and
 * only clamped when read, so it comes back if the hardware does.
 */
export function cpuCoresFor(chosen: number | null, hostCores: number): number {
  const cores = Math.max(1, hostCores)
  return Math.min(cores, Math.max(1, chosen ?? defaultCpuCores(cores)))
}

/** A CPU cores choice as the API receives it: a whole number from one to this machine's core count, or null. */
export function parseCpuCores(value: unknown, hostCores: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 1 || value > hostCores) return null
  return value
}

export function invalidCpuCoresMessage(hostCores: number): string {
  return hostCores === 1
    ? 'This server has one core, so CPU cores can only be 1.'
    : `CPU cores is a whole number from 1 to ${hostCores}.`
}
