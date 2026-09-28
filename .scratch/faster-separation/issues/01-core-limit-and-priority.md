# 01: A core limit, and a Separation that yields

**What to build:** Today a Separation's ONNX session takes `availableParallelism()` threads (every logical core the cgroup allows) at normal priority. On the Desktop App, that competes with the browser recording a Take on the same machine.

- Settings gains a **Separation** section. Its first control is **CPU cores**: a whole number from 1 to the machine's core count, defaulting to all but one (or 1 on a one-core machine). A value saved on bigger hardware is clamped to what this machine has.
- Above it, a line says whose hardware this is: "On this server: 8 cores" (the GPU half arrives with ticket 04). Connected, it describes the server.
- The Separation subprocess (`separate-cli.ts`) runs at lowered OS priority (`os.setPriority`, below normal on Windows) and gets the core limit as its thread count. Both are read when the Separation **starts**, not when it's queued.
- Where the subprocess can't lower its own priority, the Separation still runs, and the failure is logged once. It never fails the Job.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] The core limit is saved, clamped to the machine, and defaults to cores − 1 (minimum 1)
- [ ] The Separation's ONNX session uses exactly that many intra-op threads
- [ ] The subprocess runs below normal priority on Linux, macOS, and Windows
- [ ] A change to the limit affects the next Separation to start, not the one running
- [ ] The Settings line names the hosting machine's core count, including when Connected
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
