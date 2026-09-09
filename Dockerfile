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
WORKDIR /app
# ffmpeg (with ffprobe) normalizes every Source and renders every Mix.
# yt-dlp fetches a YouTube import's audio and metadata; Node — already this
# image's own base — is what it shells out to for solving YouTube's player
# challenges. curl only exists to fetch the yt-dlp binary itself and is
# removed again in the same layer.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
  && curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get purge -y curl && apt-get autoremove -y \
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
# Nitro's bundle, so that file — and a real node_modules for the packages it
# imports — needs to exist here independently of `.output`.
COPY --from=build /app/server/lib/separators ./server/lib/separators
COPY --from=build /app/app/audio/wav.ts ./app/audio/wav.ts
COPY --from=build /app/node_modules ./node_modules
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
