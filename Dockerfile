# Akapela app (Nuxt). Every background Job — import, render, separate —
# runs inside this image now; there is no second one (ADR 0002 superseded).
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
# No C++ toolchain here on purpose: better-sqlite3 and onnxruntime-node both
# ship a prebuilt binding for every platform this runs on, and the root
# package.json keeps them out of pnpm's `onlyBuiltDependencies` list of
# things node-gyp needs to rebuild. Listing either there again would put a
# compiler back on the critical path here and on every contributor's machine.
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24-bookworm-slim
RUN corepack enable
WORKDIR /app
# ffmpeg (with ffprobe) normalizes every Source and renders every Mix.
# yt-dlp fetches a YouTube import's audio and metadata; Node — already this
# image's own base — is what it shells out to for solving YouTube's player
# challenges. We fetch the `yt-dlp_linux` asset specifically: it's a
# PyInstaller-built standalone binary, unlike the plain `yt-dlp` asset, which
# is a Python zipapp that needs a `python3` on PATH this image doesn't carry.
# ca-certificates is what lets curl verify the TLS connection both of these
# fetches happen over — the slim base image carries no CA bundle on its own,
# unlike Node's `fetch`, which ships with its own.
#
# This stays Debian, not Alpine: onnxruntime-node (installed below) only
# ships a glibc build — there's no musl one upstream — and it doesn't run
# under Alpine's musl libc even with the `gcompat` compatibility shim
# (verified: it dlopens, but fails relocating `fcntl64`, a glibc-only libc
# symbol musl never had a reason to add). Alpine would shrink this image by
# a few hundred MB and break vocal separation outright.
#
# ffmpeg itself is a static build (BtbN/FFmpeg-Builds, the same GitHub-releases
# trust model as the yt-dlp fetch above) rather than the `apt-get install
# ffmpeg` this used to be: Debian's package pulls in ffmpeg's entire shared
# library dependency tree — every codec library it links against — which on
# its own is ~460MB, nearly a quarter of this whole image, for two binaries
# that between them only ever ask for `pcm_s16le` (built into ffmpeg's core,
# no library needed), `libmp3lame` (server/lib/audio.ts is the only caller of
# either), and the `rubberband` filter `renderMix` builds into every Mix's
# `-filter_complex` — which is exactly why this is the "gpl" build variant,
# not "lgpl": BtbN's own build scripts (`scripts.d/50-rubberband.sh`) strip
# librubberband out of every `lgpl*` variant, GPL being what it is, and ADR
# 0004 already commits this whole project to GPL-3.0 because of Rubber Band,
# so there's no license upside to the "lgpl" build costing this app its one
# actual pitch/tempo engine.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
  && ffmpeg_arch="$(dpkg --print-architecture)" \
  && case "$ffmpeg_arch" in \
    amd64) ffmpeg_arch=linux64 ;; \
    arm64) ffmpeg_arch=linuxarm64 ;; \
    *) echo "unsupported architecture for the ffmpeg static build: $ffmpeg_arch" >&2; exit 1 ;; \
  esac \
  && curl -fL "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-${ffmpeg_arch}-gpl.tar.xz" -o /tmp/ffmpeg.tar.xz \
  && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp "ffmpeg-master-latest-${ffmpeg_arch}-gpl/bin/ffmpeg" "ffmpeg-master-latest-${ffmpeg_arch}-gpl/bin/ffprobe" \
  && install -m a=rx "/tmp/ffmpeg-master-latest-${ffmpeg_arch}-gpl/bin/ffmpeg" /usr/local/bin/ffmpeg \
  && install -m a=rx "/tmp/ffmpeg-master-latest-${ffmpeg_arch}-gpl/bin/ffprobe" /usr/local/bin/ffprobe \
  && rm -rf /tmp/ffmpeg.tar.xz "/tmp/ffmpeg-master-latest-${ffmpeg_arch}-gpl" \
  && curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get purge -y curl xz-utils && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATA_DIR=/data \
    NUXT_MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/.output ./.output
COPY --from=build /app/server/db/migrations ./migrations
# The separate Job isolates its ONNX inference in its own `node` subprocess
# (server/lib/separators/separate-cli.ts) rather than running it through
# Nitro's bundle, so that file — and a node_modules for the packages it
# imports — needs to exist here independently of `.output`. `.output/server`
# already carries its own pruned node_modules for everything Nitro's build
# couldn't inline (Nitro does this automatically — see its `server/node_modules`
# after any local `pnpm build`), so copying this app's own node_modules
# wholesale would only be for these three packages' benefit, at the cost of
# every devDependency and the whole Nuxt/Vite build toolchain that `nuxt`
# itself depends on — none of which anything here at runtime touches.
# server/lib/separators/package.json scopes the install to just what
# separate-cli.ts imports, with its own lockfile for the same determinism
# the root install gets from pnpm-lock.yaml.
COPY --from=build /app/server/lib/separators ./server/lib/separators
COPY --from=build /app/app/audio/wav.ts ./app/audio/wav.ts
# onnxruntime-node ships every platform's binary in one package regardless of
# which one installs it (there's no per-platform split like better-sqlite3
# has) — linux/x64 and linux/arm64 together are already ~65MB, and darwin
# and win32 add over 200MB more that neither this image nor its self-hoster's
# machine will ever run. Keeping only the architecture this stage actually
# targets is what makes the difference between "ships every platform" and
# "ships one". `ONNXRUNTIME_NODE_INSTALL=skip` matters even more: left
# unset, its postinstall reaches out to NuGet for the CUDA execution
# provider — a ~220MB .so this app never asks for, since `mdx-net.ts`
# creates its session with `executionProviders: ['cpu']` only. That one
# variable is most of what separates a ~2.9GB image from this one.
#
# pnpm's own content-addressable store (`pnpm store path` — under `/root`
# here, since this all runs as root) is a second, separate copy of every
# package it fetches, kept around for future hardlinking/dedup; it isn't
# under `node_modules` so pruning that above never touches it, and it's
# useless in an image that will never run `pnpm install` again. Removing it
# doesn't touch the packages actually installed: pnpm hardlinks store
# content into `node_modules`, so those files exist independently of the
# store copy once the link is made.
RUN cd server/lib/separators \
  && CI=true ONNXRUNTIME_NODE_INSTALL=skip pnpm install --prod --frozen-lockfile \
  && ort_arch="$(dpkg --print-architecture)" \
  && case "$ort_arch" in \
    amd64) ort_arch=x64 ;; \
    arm64) ort_arch=arm64 ;; \
    *) echo "unsupported architecture for onnxruntime-node: $ort_arch" >&2; exit 1 ;; \
  esac \
  && find node_modules/onnxruntime-node/bin/napi-v6 -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} + \
  && find node_modules/onnxruntime-node/bin/napi-v6/linux -mindepth 1 -maxdepth 1 ! -name "$ort_arch" -exec rm -rf {} + \
  && rm -rf "$(pnpm store path)" /root/.cache
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
