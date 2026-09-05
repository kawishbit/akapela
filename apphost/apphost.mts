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

// Everything a contributor can configure is an AppHost parameter, so the
// Dashboard's Parameters tab is the whole answer to "what can I change?".
// Each keeps the behaviour the repo has always had when left alone. AGENTS.md
// documents how to change one; this is the Aspire path only, and compose still
// reads `.env`.
const configuration = builder.getConfiguration();

/**
 * What is configured for a parameter, or an empty string.
 *
 * Load-bearing: `addParameter`'s `value` is a constant that *shadows*
 * configuration rather than a default it falls back to, so a parameter given a
 * value here ignores `aspire secret set Parameters:<name>` entirely. Reading
 * the configuration and folding it into that value is what makes an override
 * work at all. It also lets the AppHost use two of these itself — the port has
 * to be a number before the endpoint can be declared, and a data directory has
 * to be made absolute before either half sees it.
 */
async function configured(name: string): Promise<string> {
  return (await configuration.getConfigValue(`Parameters:${name}`)) || '';
}

// One data directory for both halves. The app and the Worker each resolve their
// own environment variable against their own working directory, and those
// directories differ, so a relative path would silently give them two different
// databases and a Job that never runs. The AppHost owns the absolute path and
// hands the same one to each under the name each already reads — which is also
// why an override is resolved against the repo root here, exactly as compose
// resolves AKAPELA_DATA against the file it sits beside.
const dataDir = await builder
  .addParameter('data-dir', { value: resolve(repoRoot, (await configured('data-dir')) || 'data') })
  .withDescription(
    'Directory holding the database and every Track\'s files, shared by the app and the Worker. '
    + 'A relative path is resolved against the repo root. Defaults to `data/`.',
    { enableMarkdown: true },
  );

// The port the app is *published* on — what the Dashboard's endpoint link
// carries and what a contributor types. Empty by default, so Aspire allocates
// one and repeat runs never collide; pin it only when you want a stable URL,
// and accept the collision that comes with a fixed port. Nuxt is handed the
// port it listens on behind that as PORT, and that one stays Aspire's to
// allocate either way, so a stray `pnpm dev` on 3000 is never in the way.
const configuredPort = await configured('app-port');
if (configuredPort && !/^\d+$/.test(configuredPort)) {
  // Left alone, `Number()` would make this NaN and the endpoint would fail
  // somewhere far from the typo that caused it.
  throw new Error(`Parameters:app-port must be a port number, not ${JSON.stringify(configuredPort)}.`);
}
await builder
  .addParameter('app-port', { value: configuredPort })
  .withDescription(
    'Port the app is published on. Leave empty and Aspire allocates a free one for each run.',
  );

// Optional. With a token, Genius joins LRCLIB and Manual as a Lyrics Provider;
// without one the app hides it and the others carry on, so an empty value is a
// working configuration rather than a missing one. Secret, so the Dashboard
// masks it and `aspire secret set` is the way in.
const geniusToken = await builder
  .addParameter('genius-token', { value: await configured('genius-token'), secret: true })
  .withDescription(
    'Optional Genius API token, from [genius.com/api-clients](https://genius.com/api-clients). '
    + 'Leave empty and Genius is simply not offered as a Lyrics Provider.',
    { enableMarkdown: true },
  );

const app = await builder
  .addJavaScriptApp('app', repoRoot, { runScriptName: 'dev' })
  .withPnpm()
  .withHttpEndpoint({ env: 'PORT', port: configuredPort ? Number(configuredPort) : undefined })
  .withEnvironment('NUXT_DATA_DIR', dataDir)
  .withEnvironment('AKAPELA_GENIUS_TOKEN', geniusToken)
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
