/**
 * The command line `separate-cli.ts` takes, both ends written down once the
 * way `progress.ts` does for what it prints: the separate Job formats it, the
 * subprocess parses it. Named flags rather than positions, because every
 * setting a Separation reads when it starts ends up here.
 */
export interface SeparateCliArgs {
  modelPath: string
  inputPath: string
  instrumentalPath: string
  vocalsPath: string
  /** Intra-op threads for the model: the core limit in force when the Separation started. */
  threads: number
}

const FLAGS = {
  modelPath: '--model',
  inputPath: '--input',
  instrumentalPath: '--instrumental',
  vocalsPath: '--vocals',
  threads: '--threads',
} as const satisfies Record<keyof SeparateCliArgs, string>

export function formatSeparateCliArgs(args: SeparateCliArgs): string[] {
  return (Object.keys(FLAGS) as Array<keyof SeparateCliArgs>).flatMap(key => [FLAGS[key], String(args[key])])
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

  const threads = Number(values.get(FLAGS.threads))
  if (!Number.isInteger(threads) || threads < 1) return `${FLAGS.threads} is a whole number of at least 1`

  return {
    modelPath: values.get(FLAGS.modelPath)!,
    inputPath: values.get(FLAGS.inputPath)!,
    instrumentalPath: values.get(FLAGS.instrumentalPath)!,
    vocalsPath: values.get(FLAGS.vocalsPath)!,
    threads,
  }
}
