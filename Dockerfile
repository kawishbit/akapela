# Akapela app (Nuxt). The worker has its own image under ./worker.
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
# Native build of better-sqlite3 needs a toolchain; python3 is for node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
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
