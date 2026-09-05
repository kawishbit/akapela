// Akapela AppHost: local development only.
//
//   aspire run          (from anywhere in the repo; the CLI finds this file)
//
// Starts the Nuxt app and opens the Aspire dashboard, where its endpoint and
// logs live. `pnpm dev` still runs the app on its own, and `docker compose up`
// remains the way Akapela is actually deployed (ADR 0007).
//
// This file is the only one here meant to be hand-edited: `.aspire/modules/` is
// generated from it and the integration packages, and is rewritten on restore.

import { resolve } from 'node:path';
import { createBuilder } from './.aspire/modules/aspire.mjs';

const builder = await createBuilder();

// The app resolves NUXT_DATA_DIR against its own working directory. Hand it an
// absolute path so the database and audio land in the repo's `data/` directory
// no matter where the AppHost was started from, and so the Worker can be
// pointed at the same one later.
const repoRoot = resolve(import.meta.dirname, '..');
const dataDir = resolve(repoRoot, 'data');

// No fixed port: Aspire allocates one and passes it as PORT, so a stray
// `pnpm dev` on 3000 and repeat runs never collide.
await builder
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

await builder.build().run();
