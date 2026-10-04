#!/bin/sh
# Container entrypoint for the Leafy API image.
#   serve (default CMD)  alembic upgrade head, seed the catalog, then run uvicorn
#   anything else        exec as given, e.g. the purge service:
#                        python -m app.jobs.purge_storage --loop
# Configuration comes only from the environment; nothing is baked into the image.
set -eu

if [ "${1:-serve}" = "serve" ]; then
  alembic upgrade head
  python -m app.seeds
  exec uvicorn app.main:create_app --factory \
    --host 0.0.0.0 --port "${PORT:-8000}" --no-server-header
fi

exec "$@"
