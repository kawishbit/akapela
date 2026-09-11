import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'

/**
 * The server, as a child process the window sits over.
 *
 * Akapela on the desktop is the same app compose runs, not a second one
 * (ADR 0009): Electron starts the built Nitro server on loopback and points a
 * window at it. The child is Electron's own binary run as Node
 * (`ELECTRON_RUN_AS_NODE=1`), so there is no second runtime in the installer.
 * That variable is inherited by the server's own subprocesses too, which is
 * what stops the separation CLI from launching a second copy of the GUI when
 * it spawns `process.execPath` (`server/lib/tools.ts`).
 *
 * Supervision earns its keep immediately: `POST /api/backup/restore`
 * deliberately exits the process and relies on something outside to bring a
 * fresh one back. Compose's `restart: unless-stopped` does that and `pnpm dev`
 * does not — here, Electron does, so restoring a backup finishes.
 *
 * No Electron import: everything Electron-shaped arrives as an option.
 */

export interface ServerOptions {
  /** Electron's own binary, run as Node. */
  execPath: string
  /** `.output/server/index.mjs`. */
  entry: string
  port: number
  /** Extra environment for the child: `NUXT_DATA_DIR`, the tool overrides, and so on. */
  env: NodeJS.ProcessEnv
  /** Where the child's stdout and stderr are appended, so a bug report can quote them. */
  logFile: string
  /** Called with each line the child writes, for the terminal in a development run. */
  onOutput?: (line: string) => void
}

const READY_PATH = '/api/settings'
const READY_POLL_MS = 250
const READY_PROBE_TIMEOUT_MS = 3_000
const READY_TIMEOUT_MS = 90_000
/** How long a `close` hook gets to drain before the process is taken out. */
const GRACEFUL_EXIT_MS = 5_000
/** Long enough that a server crash-looping does not spin the CPU, short enough to feel automatic. */
const RESTART_DELAY_MS = 500

export class ServerStartError extends Error {}

export class AkapelaServer {
  private child: ChildProcess | undefined
  private log: WriteStream | undefined
  private quitting = false
  private restartTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private options: ServerOptions) {}

  get origin(): string {
    return `http://127.0.0.1:${this.options.port}`
  }

  /** Replaces the options for every later (re)start — how ticket 08 changes libraries. */
  reconfigure(options: Partial<ServerOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /** Starts the child and resolves once it answers, or rejects if it never does. */
  async start(): Promise<void> {
    this.spawnChild()
    await this.waitUntilReady()
  }

  /** Stops the current child and starts a fresh one — used after the library folder changes. */
  async restart(): Promise<void> {
    await this.stop()
    this.quitting = false
    await this.start()
  }

  /**
   * Asks the server to shut down so the Job runner's `close` hook runs, and
   * kills it if it has not gone in a few seconds.
   *
   * SIGTERM is what Nitro listens for. On Windows there is no such signal and
   * the OS terminates the process outright — the same abrupt end a
   * `docker compose down` gives it mid-separation, which leaves the Job
   * `running` and the Track offering a retry. That is deliberately not worth a
   * confirmation dialog.
   */
  stop(): Promise<void> {
    this.quitting = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.closeLog()
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(hardKill)
        this.closeLog()
        resolve()
      }
      const hardKill = setTimeout(() => {
        child.kill('SIGKILL')
        done()
      }, GRACEFUL_EXIT_MS)
      child.once('exit', done)
      child.kill('SIGTERM')
    })
  }

  private spawnChild(): void {
    mkdirSync(dirname(this.options.logFile), { recursive: true })
    this.log ??= createWriteStream(this.options.logFile, { flags: 'a' })

    const child = spawn(this.options.execPath, [this.options.entry], {
      env: {
        ...process.env,
        // The whole trick: Electron's binary behaves as plain Node when this
        // is set, so the installer ships one runtime rather than two. Written
        // out again here rather than shared with the server's own `childEnv()`
        // in `server/lib/tools.ts`, because `desktop/` is a separate package
        // with a separate install — the same arm's length `apphost/` keeps.
        // The server inherits this and passes it on to its own children, which
        // is what stops the separation CLI from opening a second window.
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(this.options.port),
        ...this.options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child

    const relay = (chunk: Buffer) => {
      const text = chunk.toString()
      this.log?.write(text)
      if (this.options.onOutput) for (const line of text.split('\n')) if (line.trim()) this.options.onOutput(line)
    }
    child.stdout?.on('data', relay)
    child.stderr?.on('data', relay)

    child.on('exit', (code, signal) => {
      this.log?.write(`\n[akapela] server exited (code ${code}, signal ${signal})\n`)
      if (this.quitting || this.child !== child) return
      // An exit nobody asked for. `POST /api/backup/restore` is the expected
      // one: it exits on purpose so a supervisor brings the app back on the
      // restored library. Cleared as it fires, so `waitUntilReady` can still
      // tell a server that is starting from one that has given up.
      this.restartTimer = setTimeout(() => {
        this.restartTimer = undefined
        this.spawnChild()
      }, RESTART_DELAY_MS)
    })
  }

  private closeLog(): void {
    this.log?.end()
    this.log = undefined
  }

  /** Polls a real route until it answers, so the window opens on a server that has finished migrating. */
  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await serverAnswersAt(this.origin)) return
      const child = this.child
      if (child && child.exitCode !== null && !this.restartTimer) {
        throw new ServerStartError(`the Akapela server exited with code ${child.exitCode} before it started listening`)
      }
      await new Promise(resolve => setTimeout(resolve, READY_POLL_MS))
    }
    throw new ServerStartError(`the Akapela server did not start listening on ${this.origin} within 90 seconds`)
  }
}

/**
 * Whether an Akapela is answering at `origin`.
 *
 * A real route rather than a bare TCP connect, because a server that is
 * listening but still running migrations is not one a window should open on.
 * Used both to wait out a child this process started and to check the server
 * someone else is running in the `AKAPELA_SERVER_URL` loop.
 */
export async function serverAnswersAt(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${READY_PATH}`, { signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS) })
    return response.ok
  }
  catch {
    // Still starting: nothing is listening yet, or migrations are running.
    return false
  }
}
