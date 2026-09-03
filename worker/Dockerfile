# Presto worker (Python). Shares /data with the app container.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
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
