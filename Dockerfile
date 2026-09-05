# Akapela app (Nuxt). The worker has its own image under ./worker.
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
# No C++ toolchain here on purpose: better-sqlite3 ships a prebuilt binding
# for every platform this runs on, and the root package.json keeps it out of
# pnpm's `onlyBuiltDependencies` so nothing asks node-gyp to rebuild what is
# already there. Listing it there again would put a compiler back on the
# critical path here and on every contributor's machine.
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATA_DIR=/data \
    NUXT_MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/.output ./.output
COPY --from=build /app/server/db/migrations ./migrations
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
