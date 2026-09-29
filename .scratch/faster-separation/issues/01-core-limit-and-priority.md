# 01: A core limit, and a Separation that yields

**What to build:** Today a Separation's ONNX session takes `availableParallelism()` threads (every logical core the cgroup allows) at normal priority. On the Desktop App, that competes with the browser recording a Take on the same machine.

- Settings gains a **Separation** section. Its first control is **CPU cores**: a whole number from 1 to the machine's core count, defaulting to all but one (or 1 on a one-core machine). A value saved on bigger hardware is clamped to what this machine has.
- Above it, a line says whose hardware this is: "On this server: 8 cores" (the GPU half arrives with ticket 04). Connected, it describes the server.
- The Separation subprocess (`separate-cli.ts`) runs at lowered OS priority (`os.setPriority`, below normal on Windows) and gets the core limit as its thread count. Both are read when the Separation **starts**, not when it's queued.
- Where the subprocess can't lower its own priority, the Separation still runs, and the failure is logged once. It never fails the Job.

**Blocked by:** —

**Status:** done

- [x] The core limit is saved, clamped to the machine, and defaults to cores − 1 (minimum 1)
- [x] The Separation's ONNX session uses exactly that many intra-op threads
- [x] The subprocess runs below normal priority on Linux, macOS, and Windows
- [x] A change to the limit affects the next Separation to start, not the one running
- [x] The Settings line names the hosting machine's core count, including when Connected
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29: The limit is `settings.cpu_cores` (null reads as cores − 1), clamped on read by `cpuCoresFor` in `shared/separation.ts`, so a value saved on bigger hardware returns if the hardware does. The separate Job reads it when it starts and passes `--threads` to `separate-cli.ts`, whose session is built by `cpuSessionOptions`. The CLI lowers its own priority before opening the model, so on Linux ONNX Runtime's pool inherits the nice value. A failure becomes a `notice` line that the Job logs once per process. Checked by hand on Windows: the running CLI shows `PriorityClass BelowNormal`. Linux and macOS go through the same `os.setPriority` call but weren't run by hand.
