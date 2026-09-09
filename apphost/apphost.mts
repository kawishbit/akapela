// Akapela AppHost: local development only.
//
//   aspire run          (from anywhere in the repo; the CLI finds this file)
//
// Starts the Nuxt app and opens the Aspire Dashboard, where its endpoint,
// pooled logs, and traces live. `pnpm dev` still runs it on its own, and
// `docker compose up` remains the way Akapela is actually deployed
// (ADR 0007). There used to be a second resource here — a Python worker
// process — but every Job the app enqueues now runs inside the app itself
// (ADR 0002 superseded); this file starts one process because there is
// only one to start.
//
// This file is the only one here meant to be hand-edited: `.aspire/modules/` is
// generated from it and the integration packages, and is rewritten on restore.

import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';
import { createBuilder, HealthStatus } from './.aspire/modules/aspire.mjs';
import type { HealthCheckResult } from './.aspire/modules/aspire.mjs';

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

// The AppHost owns the absolute path so a relative override means the same
// thing it does in compose — resolved against the repo root, exactly as
// compose resolves AKAPELA_DATA against the file it sits beside.
const dataDir = await builder
  .addParameter('data-dir', { value: resolve(repoRoot, (await configured('data-dir')) || 'data') })
  .withDescription(
    'Directory holding the database and every Track\'s files. '
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
  // Points the app at the Dashboard's OTLP endpoint, which is the whole of what
  // turns telemetry on: it treats an absent endpoint as "nobody is collecting",
  // loads nothing, and needs no collector. The protocol is left alone
  // deliberately — the Dashboard's endpoint speaks gRPC and only gRPC, and
  // asking for HTTP here is accepted and then quietly not honoured.
  .withOtlpExporter()
  // The library page is the cheapest honest liveness signal: it renders only
  // once migrations have run and the database is open. Named rather than left
  // to the default, so moving what lives at `/` has to think about this too.
  .withHttpHealthCheck({ path: '/' });

// The app shells out to tools it does not install: ffmpeg and ffprobe for
// every import and every render, yt-dlp for a YouTube import's audio and
// metadata, and Node for the JavaScript yt-dlp has to run to solve YouTube's
// player challenges (the same Node the app itself runs on, but yt-dlp finds
// it on the PATH independently, so it is checked independently too). Missing,
// none of them stop the app from starting — they surface later as a Job that
// failed, or as a YouTube import that quietly settled for a worse format. A
// health check says so at startup instead, in the Dashboard, next to the
// resource that needs them.
//
// This is the AppHost's own environment, which is exactly what it hands the
// app process, so it is the PATH the app will really search. It is also only
// ever the development path: the compose image installs all of these, and
// nothing here runs in a container (ADR 0007), so there is no container in
// which this could fire spuriously.
//
// Nothing here is cached: the probe repeats, so installing what is missing into
// a directory already on the PATH is enough to go healthy without a restart.

// `install` is a whole sentence, and identical sentences are said once, so the
// usual case — ffmpeg and ffprobe absent together, as one package — does not
// repeat the same install line twice.
const ffmpegInstall
  = 'Install ffmpeg — ffprobe ships with it: '
    + 'winget install Gyan.FFmpeg, brew install ffmpeg, or apt install ffmpeg.';

const appPrerequisites = [
  {
    command: 'ffmpeg',
    cost: 'no Track can be imported and no Mix can be rendered',
    install: ffmpegInstall,
    // ffmpeg and ffprobe are what the app cannot do this job at all without.
    essential: true,
  },
  {
    command: 'ffprobe',
    cost: 'no audio duration can be read, which every import and render needs',
    install: ffmpegInstall,
    essential: true,
  },
  {
    command: 'yt-dlp',
    cost: 'a YouTube URL cannot be imported; uploading a file still works',
    install: 'Install the standalone yt-dlp binary from https://github.com/yt-dlp/yt-dlp#installation.',
    essential: false,
  },
  {
    command: 'node',
    cost: "YouTube imports lose formats, because yt-dlp cannot run YouTube's player challenges",
    install: 'Install Node 22 or newer, from https://nodejs.org or through nvm.',
    // Everything that is not a YouTube import still works, so this is Degraded
    // rather than Unhealthy — loud, but honest that uploads are unaffected.
    essential: false,
  },
];

// Windows resolves a bare command name against PATHEXT; everywhere else the
// file itself has to be executable. Node has no `which`, and spawning each tool
// to see whether it answers would cost a process per check, so this stats
// candidates and stops at the first hit — nothing measurable when a tool is
// present, and a few hundred stats when it is not.
const pathExtensions = process.platform === 'win32'
  ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  : [''];

async function onPath(command: string): Promise<boolean> {
  // Executable-bit checks are meaningless on Windows, where access() ignores
  // X_OK and would call every readable file runnable.
  const mode = process.platform === 'win32' ? constants.F_OK : constants.X_OK;
  for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const extension of pathExtensions) {
      try {
        await access(join(directory, command + extension), mode);
        return true;
      } catch {
        // Not this candidate. A missing directory on the PATH lands here too.
      }
    }
  }
  return false;
}

async function checkAppPrerequisites(): Promise<HealthCheckResult> {
  const found = await Promise.all(appPrerequisites.map(tool => onPath(tool.command)));
  const missing = appPrerequisites.filter((_, index) => !found[index]);
  if (missing.length === 0) {
    return { status: HealthStatus.Healthy, description: 'ffmpeg, ffprobe, yt-dlp, and node are on the PATH.' };
  }
  return {
    status: missing.some(tool => tool.essential) ? HealthStatus.Unhealthy : HealthStatus.Degraded,
    description: [
      ...missing.map(tool => `${tool.command} is not on the PATH — ${tool.cost}.`),
      ...new Set(missing.map(tool => tool.install)),
    ].join(' '),
  };
}

await builder.addHealthCheck('app-prerequisites', checkAppPrerequisites);

// Reports; it never aborts. Nothing waits on this, so a missing tool leaves
// the app running and everything that does not need that tool working — it
// just stops being a surprise.
await app.withHealthCheck('app-prerequisites');

await builder.build().run();
