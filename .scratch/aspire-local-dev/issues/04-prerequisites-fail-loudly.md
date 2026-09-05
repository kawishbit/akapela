# 04: Prerequisites fail loudly, not mysteriously

**What to build:** A contributor missing `ffmpeg`, `ffprobe`, or Node on the PATH finds out at startup, from a clearly unhealthy Worker in the dashboard naming what is missing, rather than an hour later from a YouTube import that quietly offered fewer formats or a Mix render that died partway. The check runs when the AppHost starts the Worker and costs nothing when the tools are present.

**Blocked by:** 02 (The Worker joins the graph and the Job loop closes)

**Status:** ready-for-human

- [x] The Worker reports unhealthy at startup when `ffmpeg` or `ffprobe` is absent, with a message naming the missing tool and how to install it
- [x] A missing Node runtime is reported the same way, noting that YouTube imports lose formats without it
- [x] With all prerequisites present the Worker reports healthy promptly and the check adds no noticeable startup delay
- [x] The check reports rather than aborts: the app stays usable for everything that does not need the missing tool
- [x] The same check does not fire spuriously inside the Worker container, where the image already provides these tools

## Comments

A `worker-prerequisites` health check, registered on the builder with `addHealthCheck` and attached to the Worker with `withHealthCheck`. It resolves `ffmpeg`, `ffprobe`, and `node` against the AppHost's own PATH, which is exactly the environment the AppHost hands the Worker process, so it is the PATH the Worker will really search.

Verified by running it four ways.

- All three present: the Worker is Healthy the moment the app is, and `aspire wait worker` returns in 0.0s. The check itself is a stat per PATHEXT candidate per PATH entry, measured at 13–49ms per tool with all three run in parallel — and it sits on the Worker, not on anything the app's startup waits for.
- `ffmpeg` and `ffprobe` scrubbed off the PATH: Unhealthy, naming both and what each costs, with one shared install line. The Worker's State stayed `Running` throughout and its log shows it polling for Jobs, which is the reporting-not-aborting criterion: nothing waits on the Worker's health, so a missing tool leaves everything that does not need it working.
- `node` unresolvable: Degraded, naming it and saying YouTube imports lose formats.
- The container: not run, because there is no container in which this could run. The check is AppHost TypeScript and the AppHost is never in the compose path (ADR 0007); `worker/Dockerfile` installs ffmpeg and copies in the Node binary regardless. That checkbox is closed by construction rather than by observation, which is worth knowing if the AppHost ever grows a published mode.

Two decisions worth recording.

- **A missing Node is Degraded, not Unhealthy.** The ticket says Node is "reported the same way", and this is the same mechanism and the same message shape but a lesser status. Everything that is not a YouTube import still works without Node, and the ticket's own fourth criterion asks the check to stay honest that the app is usable for whatever does not need the missing tool. Degraded is still loud in the Dashboard; it just does not claim the Worker is broken when it is not.
- **Resolving the PATH by hand rather than spawning each tool.** `node -v` per tool would be a process per probe, and health probes repeat. Statting candidates and stopping at the first hit costs nothing when a tool is present. It does mean honouring PATHEXT on Windows and the executable bit everywhere else — `access()` ignores `X_OK` on Windows and would call every readable file runnable.

Nothing is cached, so installing what was missing into a directory already on the PATH is enough to go healthy without restarting the AppHost.

`AGENTS.md` gained a paragraph on the three tools and what their absence does. The wider onboarding write-up is 06's.
