# syntax=docker/dockerfile:1

# Leafy API image. Build context is ./api (see docker-compose.yml).
ARG PYTHON_VERSION=3.12.11
ARG UV_VERSION=0.11.24

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# ---- builder: locked, production only dependencies into /app/.venv ----
FROM python:${PYTHON_VERSION}-slim-bookworm AS builder
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
# Manifests first so this layer is cached until the lockfile changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# ---- runtime ----
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime
# Defaults carry no secrets. DATABASE_URL, JWT_SECRET, S3_ACCESS_KEY and S3_SECRET_KEY
# must be supplied at run time (docker-compose passes them from .env).
ENV ENV=prod \
    PORT=8000 \
    PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system --gid 10001 leafy \
    && useradd --system --uid 10001 --gid leafy --no-create-home --shell /usr/sbin/nologin leafy
WORKDIR /app
COPY --from=builder --chown=leafy:leafy /app/.venv /app/.venv
# Only what runs: the package (seed JSON and catalog photos live under app/seeds),
# the Alembic config and the entrypoint. Tests, tools and dev files stay out.
COPY --chown=leafy:leafy alembic.ini ./
COPY --chown=leafy:leafy app ./app
COPY --chown=leafy:leafy --chmod=0755 entrypoint.sh ./entrypoint.sh
USER leafy
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/v1/healthz' % os.environ.get('PORT', '8000'), timeout=4)"]
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["serve"]
