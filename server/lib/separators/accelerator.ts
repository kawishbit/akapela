/**
 * Which GPU backend a Separation can run on (ADR 0013 amendment). One switch
 * in Settings, never a picker: Akapela works out the one backend this machine
 * can use, and the switch only says whether to use it.
 *
 * Imports nothing, so both the server and `separate-cli.ts` (under plain Node,
 * and in the compose image, which copies only this directory) share it.
 */

export const GPU_BACKENDS = ['cuda', 'dml', 'coreml'] as const
export type GpuBackend = (typeof GPU_BACKENDS)[number]

/** What Settings calls each: "On this server: 8 cores, GPU: DirectML". */
export const GPU_BACKEND_LABELS: Record<GpuBackend, string> = {
  cuda: 'CUDA',
  dml: 'DirectML',
  coreml: 'CoreML',
}

export interface Accelerator {
  backend: GpuBackend
  /**
   * Which adapter, for a backend that has a choice of them. DirectML counts
   * every adapter the machine has, the integrated one usually first — on a
   * laptop with both, device 0 is the slow one — so detection times each and
   * keeps the fastest.
   */
  deviceId?: number
}

/**
 * The backends worth trying here, which is every one `onnxruntime-node`
 * ships for this platform:
 *
 * - DirectML on Windows x64 and arm64, whose DLLs are in the package's
 *   Windows binaries already.
 * - CoreML on macOS arm64, compiled into the package's macOS binding (checked
 *   on 1.29.0: its `onnxruntime_binding.node` registers `coreml`).
 * - CUDA on Linux x64, but only where its provider library was installed
 *   (`--onnxruntime-node-install=cuda12`) and CUDA and cuDNN are loadable —
 *   the compose `gpu` image, and nowhere else. The Linux Desktop App never
 *   tries: it ships no provider, and a Separation is not where to find out a
 *   singer's drivers are wrong.
 */
export function candidateBackends(platform: NodeJS.Platform, arch: string, desktopApp: boolean): GpuBackend[] {
  if (platform === 'win32' && (arch === 'x64' || arch === 'arm64')) return ['dml']
  if (platform === 'darwin' && arch === 'arm64') return ['coreml']
  if (platform === 'linux' && arch === 'x64' && !desktopApp) return ['cuda']
  return []
}

/** How an Accelerator travels on a command line: `dml:1`, `coreml`. */
export function formatAccelerator({ backend, deviceId }: Accelerator): string {
  return deviceId === undefined ? backend : `${backend}:${deviceId}`
}

export function parseAccelerator(value: string): Accelerator | null {
  const [backend, device, ...rest] = value.split(':')
  if (rest.length > 0 || !(GPU_BACKENDS as readonly string[]).includes(backend ?? '')) return null
  if (device === undefined) return { backend: backend as GpuBackend }
  const deviceId = Number(device)
  if (!Number.isInteger(deviceId) || deviceId < 0) return null
  return { backend: backend as GpuBackend, deviceId }
}

/** The `--detect` argument: backends, comma-separated. Anything unknown is dropped. */
export function parseBackendList(value: string): GpuBackend[] {
  return value.split(',').filter((name): name is GpuBackend => (GPU_BACKENDS as readonly string[]).includes(name))
}
