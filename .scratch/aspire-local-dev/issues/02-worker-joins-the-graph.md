# 02: The Worker joins the graph and the Job loop closes

**What to build:** The same one command now starts the Worker alongside the app. Both are pointed at one data directory that the AppHost owns and hands to each of them, so the app and the Worker can no longer disagree about where the database and audio live — today that mismatch shows up only as a Job that silently never runs. A contributor imports a Track in the dashboard-launched app and watches the Job move queued to running to succeeded, with the Worker's logs sitting beside the app's in the dashboard.

**Blocked by:** 01 (AppHost boots the app under one command)

**Status:** ready-for-human

- [x] The AppHost declares the Python Worker as a resource, run through uv from the Worker's directory
- [x] The data directory is modelled once in the AppHost and passed to both the app and the Worker under the environment variable each already reads, with no change to how either resolves it
- [x] Starting the AppHost brings up app and Worker together; stopping it stops both, leaving no orphaned Worker holding the database
- [x] Importing an uploaded Track through the dashboard-launched app produces a Job that the Worker picks up and marks succeeded, and the resulting Backing Track plays
- [x] The dashboard shows the Worker's console output, including per-Job progress, without needing a second terminal
- [x] The Worker starts after the app so migrations have run, and a Worker restart from the dashboard rejoins the same data directory
- [x] The Worker's own test command is unaffected and still runs without the AppHost

## Comments

Verified by running it. `aspire run` brings up four resources: `app`, `worker`, and the two `uv sync` / `pnpm install` installers Aspire runs first. `aspire describe` shows both app and Worker Running and Healthy, and both their logs pool into the Dashboard.

The Worker is `addPythonExecutable('worker', worker/, 'akapela-worker')` with `.withUv()` — the console script the package already declares, out of the virtual environment `uv sync` prepares, which is exactly what `uv run akapela-worker` gets you. `uv run pytest` in `worker/` is untouched and still passes on its own.

`.waitFor(app)` on the app's health check is what orders the two. The Worker's logs show it waiting for `worker-installer` to finish and then for `app` to become healthy before its process starts, so migrations have always run by then. `main.py`'s own wait-for-the-database loop stays as the compose fallback rather than the normal path. `aspire resource worker restart` brings it back on the same `data/`.

An uploaded Track imported through the Dashboard's endpoint link went queued to succeeded, the Track reached `ready` with its duration, and `/backing` served the audio.

Two things this ticket did not anticipate:

- Per-Job progress only ever reached the `jobs` table, so "the dashboard shows per-Job progress" was not true of the console output. `JobContext.progress` now says the percent as well as writing it. Nothing else about it changed: an attempt to also move the YouTube download callback's de-duplication into `progress` was backed out in review, because a Job-wide guard silently swallows the `PROGRESS_AUDIO_ON_DISK` milestone whenever the download's last report already landed on it. The noisy caller keeps owning its own noise.
- Python block-buffers stdout when it is not attached to a terminal, and under Aspire it never is, so progress would have reached the Dashboard in late bursts. The Worker gets `PYTHONUNBUFFERED=1`.

Still hard-wired rather than AppHost parameters, as planned for 03: the data directory and the Genius token.
