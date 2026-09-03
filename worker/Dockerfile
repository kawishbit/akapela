# Presto worker (Python). Shares /data with the app container.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
# yt-dlp needs a JavaScript runtime to solve YouTube's player challenges; Deno
# is the one it enables by default. Without it many formats go missing.
COPY --from=denoland/deno:bin-2.9.6 /deno /usr/local/bin/deno
# ffmpeg (with ffprobe) normalizes every Source into the Backing Track WAV.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PRESTO_DATA_DIR=/data \
    PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock README.md ./
COPY presto_worker ./presto_worker
RUN uv sync --frozen --no-dev
VOLUME ["/data"]
# Run the installed console script directly; no uv resolution at runtime.
CMD ["/app/.venv/bin/presto-worker"]
