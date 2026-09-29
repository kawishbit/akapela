import { formatAccelerator, parseAccelerator, type Accelerator } from './accelerator.ts'
import { isSeparationModelName, SEPARATION_MODEL_NAMES, type SeparationModelName } from './models.ts'

/**
 * The command line `separate-cli.ts` takes, both ends written down once the
 * way `progress.ts` does for what it prints: the separate Job formats it, the
 * subprocess parses it. Named flags rather than positions, because every
 * setting a Separation reads when it starts ends up here.
 */
export interface SeparateCliArgs {
  /** Which catalog entry the file at `modelPath` is, which is what decides how its chunks are shaped. */
  modelName: SeparationModelName
  modelPath: string
  inputPath: string
  instrumentalPath: string
  vocalsPath: string
  /** Intra-op threads for the model: the core limit in force when the Separation started. */
  threads: number
  /**
   * The GPU backend to try first, when hardware acceleration was on as the
   * Separation started and this machine has one. Absent means CPU only.
   */
  accelerator?: Accelerator
}

const ACCELERATOR_FLAG = '--accelerator'

const FLAGS = {
  modelName: '--model-name',
  modelPath: '--model',
  inputPath: '--input',
  instrumentalPath: '--instrumental',
  vocalsPath: '--vocals',
  threads: '--threads',
} as const satisfies Record<Exclude<keyof SeparateCliArgs, 'accelerator'>, string>

export function formatSeparateCliArgs(args: SeparateCliArgs): string[] {
  const required = (Object.keys(FLAGS) as Array<keyof typeof FLAGS>).flatMap(key => [FLAGS[key], String(args[key])])
  return args.accelerator ? [...required, ACCELERATOR_FLAG, formatAccelerator(args.accelerator)] : required
}

/** The parsed arguments, or a message saying what is missing or wrong. */
export function parseSeparateCliArgs(argv: string[]): SeparateCliArgs | string {
  const values = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!
    const value = argv[i + 1]
    if (value === undefined) return `${flag} has no value`
    values.set(flag, value)
  }

  const missing = Object.values(FLAGS).filter(flag => !values.has(flag))
  if (missing.length > 0) return `missing ${missing.join(', ')}`

  const modelName = values.get(FLAGS.modelName)
  if (!isSeparationModelName(modelName)) return `${FLAGS.modelName} is one of ${SEPARATION_MODEL_NAMES.join(', ')}`

  const threads = Number(values.get(FLAGS.threads))
  if (!Number.isInteger(threads) || threads < 1) return `${FLAGS.threads} is a whole number of at least 1`

  let accelerator: Accelerator | undefined
  const acceleratorValue = values.get(ACCELERATOR_FLAG)
  if (acceleratorValue !== undefined) {
    accelerator = parseAccelerator(acceleratorValue) ?? undefined
    if (!accelerator) return `${ACCELERATOR_FLAG} names no backend Akapela knows`
  }

  return {
    modelName,
    modelPath: values.get(FLAGS.modelPath)!,
    inputPath: values.get(FLAGS.inputPath)!,
    instrumentalPath: values.get(FLAGS.instrumentalPath)!,
    vocalsPath: values.get(FLAGS.vocalsPath)!,
    threads,
    ...(accelerator ? { accelerator } : {}),
  }
}

/** The one other thing the CLI does: work out which GPU backend, of `candidates`, this machine can use. */
export const DETECT_FLAG = '--detect'

export function formatDetectCliArgs(candidates: readonly string[]): string[] {
  return [DETECT_FLAG, candidates.join(',')]
}
