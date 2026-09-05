// Akapela AppHost: local development only.
//
//   aspire run          (from anywhere in the repo; the CLI finds this file)
//
// Starts the Nuxt app and the Worker and opens the Aspire Dashboard, where
// their endpoints and pooled logs live. `pnpm dev` and `uv run akapela-worker`
// still run either half on its own, and `docker compose up` remains the way
// Akapela is actually deployed (ADR 0007).
//
// This file is the only one here meant to be hand-edited: `.aspire/modules/` is
// generated from it and the integration packages, and is rewritten on restore.

import { resolve } from 'node:path';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

const repoRoot = resolve(import.meta.dirname, '..');

// One data directory for both halves. The app and the Worker each resolve their
// own environment variable against their own working directory, and those
// directories differ, so a relative path would silently give them two different
// databases and a Job that never runs. The AppHost owns the absolute path and
// hands the same one to each under the name each already reads.
const dataDir = resolve(repoRoot, 'data');

// No fixed port: Aspire allocates one and passes it as PORT, so a stray
// `pnpm dev` on 3000 and repeat runs never collide.
const app = await builder
  .addJavaScriptApp('app', repoRoot, { runScriptName: 'dev' })
  .withPnpm()
  .withHttpEndpoint({ env: 'PORT' })
  .withEnvironment('NUXT_DATA_DIR', dataDir)
  // Nuxt only opens a browser when asked (`nuxt dev -o`, or `devServer.open`),
  // but under Aspire the Dashboard is the front door, so make sure it never
  // starts doing so behind our backs.
  .withEnvironment('BROWSER', 'none')
  // The library page is the cheapest honest liveness signal: it renders only
  // once migrations have run and the database is open. Named rather than left
  // to the default, so moving what lives at `/` has to think about this too.
  .withHttpHealthCheck({ path: '/' });

// The Worker is the console script the worker package installs, run from the
// virtual environment `uv sync` prepares in `worker/` — the same thing
// `uv run akapela-worker` gets you, which is still how its tests run.
await builder
  .addPythonExecutable('worker', resolve(repoRoot, 'worker'), 'akapela-worker')
  .withUv()
  .withEnvironment('AKAPELA_DATA_DIR', dataDir)
  // Python buffers stdout in full blocks when it is not a terminal, and under
  // Aspire it never is, so without this a Job's progress would reach the
  // Dashboard in bursts minutes late, or not at all until the process exits.
  .withEnvironment('PYTHONUNBUFFERED', '1')
  // The app owns the schema and creates the database on its first start. The
  // Worker can wait for it (see `main.py`), but waiting on the app's health
  // check instead keeps that a fallback for compose rather than the normal
  // path, and keeps the Dashboard's startup order honest.
  .waitFor(app);

await builder.build().run();
