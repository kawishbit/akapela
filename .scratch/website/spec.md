# Spec: Website — where a singer downloads Akapela

Status: ready-for-agent

## Issues

One ticket per file under [`issues/`](issues/), numbered in the order they must land.

| # | Ticket | Status | Blocked by |
| - | ------ | ------ | ---------- |
| 01 | [Website skeleton, in the Hallmark design](issues/01-website-skeleton.md) | done | — |
| 02 | [Direct downloads for the latest Release](issues/02-direct-downloads.md) | done | 01 |
| 03 | [Demo video and "What it does"](issues/03-demo-video-and-features.md) | done | 01 |
| 04 | [First-launch help and the Docker route](issues/04-first-launch-and-docker.md) | done | 01 |
| 05 | [Link previews](issues/05-link-previews.md) | done | 01 |
| 06 | [Go live on Vercel](issues/06-go-live-on-vercel.md) | ready-for-human | 01 |

02–06 are independent of each other once 01 lands.

## Problem Statement

The only place to download the Desktop App is the GitHub Releases page: a list of versioned files, update metadata, blockmaps, and checksums, with nothing to say which one a singer wants. The README links to it, but the README is written for people already on GitHub. There is no address to hand someone who just wants to sing.

## Solution

A **Website** (see `CONTEXT.md`) at `akapela.kawishbit.com`: one static page that says what Akapela is, shows it working, and hands the visitor the right installer for their machine from the latest Release — plus the one extra click an unsigned installer needs, and a pointer to the Docker route for a server.

## Decisions

- **Stack.** Astro, in `site/` next to the release flow. Its own `package.json` and lockfile, installed from inside the folder — the same isolation `desktop/` and `apphost/` have, and for the same reason: the root `pnpm install` is what the Dockerfile runs. Root lint, typecheck, and test ignore `site/`.
- **Hosting.** Vercel, Root Directory `site/`, custom domain `akapela.kawishbit.com`. It redeploys on every push to `main`; that is accepted rather than filtered. No deploy hook, no secrets, no token, no change to `desktop-release.yml`.
- **Finding the installers.** Installer filenames carry the version, so no fixed link can name them. The page ships with every button pointing at `github.com/kawishbit/akapela/releases/latest` (new tab) — correct without JavaScript. In the browser it asks `api.github.com/repos/kawishbit/akapela/releases/latest` (CORS-enabled; the unauthenticated 60/hour limit is per visitor IP) and upgrades the buttons to direct links, the version, and `.sha256` links. A failed call leaves the fallback in place. The build never reads the Release, so a new Release needs no rebuild.
- **Platform.** The visitor's OS becomes the primary button, the others listed beneath. macOS is labelled Apple Silicon and Intel is never guessed at (a browser cannot tell them apart reliably, and there is no Intel build). Phones see all three with a note that it is a desktop app.
- **Content.** Pitch; the demo video; the five "What it does" points; downloads with the unsigned first-launch steps; a short Docker section linking to the self-hosting docs; a footer with GitHub and GPL-3.0. Nothing else — the README stays the source of truth.
- **Video.** The existing `demo.mp4`, not the gif, and not re-encoded. Copied in at build time from `assets/readme/` rather than committed twice (Vercel clones the whole repo). A committed poster frame, `preload="none"`: nothing downloads until play is pressed.
- **Design.** Led by the Hallmark skill, keeping the app's colour identity: Figtree, the `#1ed760` accent, and the Dark/Light values in `app/assets/css/main.css` (`DESIGN.md`, which those tokens cite, no longer exists).
- **Theme.** Follows `prefers-color-scheme`, with a toggle persisted under the app's own `akapela:theme` key and `light`/`dark` values, applied before first paint.
- **No analytics.** The product promise is that nothing leaves your machine.
- **Link previews.** A 1200×630 image made once from `assets/readme/hero.svg` and committed, with title, description, and Open Graph meta.
- **Checks.** Vercel's `astro build`, plus the root vitest suite covering the one plain function that detects the platform and matches Release assets (the `tests/unit/desktop/` pattern). No `astro check` in CI.
- **No ADR.** Moving off Vercel or Astro is cheap.

## Out of scope

- Docs, roadmap, changelog, or blog pages.
- Signing the installers, or changing their filenames.
- The Mac Desktop App's missing in-app Update (no `latest-mac.yml` on Releases) — real, but not this.
- Restoring `DESIGN.md`.
