# Akapela worker (Python). Shares /data with the app container.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
# yt-dlp needs a JavaScript runtime (Node 22+) to solve YouTube's player
# challenges; without one many formats go missing. Only the binary is needed.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
# ffmpeg (with ffprobe) normalizes every Source into the Backing Track WAV.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    AKAPELA_DATA_DIR=/data \
    PYTHONUNBUFFERED=1
# Vocal removal brings ONNX Runtime and torch, so this layer is roughly a
# gigabyte (ADR 0008). It is dependencies only: the separation model itself is
# downloaded on first use into /data, so it survives `docker compose pull` and
# costs nothing to a self-hoster who never separates a Track.
COPY pyproject.toml uv.lock README.md ./
COPY akapela_worker ./akapela_worker
RUN uv sync --frozen --no-dev
VOLUME ["/data"]
# Run the installed console script directly; no uv resolution at runtime.
CMD ["/app/.venv/bin/akapela-worker"]
