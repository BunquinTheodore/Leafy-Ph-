# Docker images

See the Docker quickstart in the README for usage. This note records design choices and what was verified.

## Design

- `api/Dockerfile`: multi stage. A builder stage copies `pyproject.toml` and `uv.lock` first and runs
  `uv sync --frozen --no-dev` (layer cached until the lockfile changes). The runtime stage copies only the
  venv, `alembic.ini`, `app/` (seed JSON and catalog photos live in `app/seeds`) and `entrypoint.sh`.
  Tests, `tools/` and `openapi.json` are excluded by `api/.dockerignore`.
- `api/entrypoint.sh`: `serve` (default) = `alembic upgrade head`, `python -m app.seeds`, uvicorn
  (`app.main:create_app --factory`). Any other arguments are exec'd, which is how the `purge` service runs
  `python -m app.jobs.purge_storage --loop` (it also calls `cleanup_tokens` on a timer).
- `app/Dockerfile`: deps, build and runtime stages. `next.config.ts` sets `output: "standalone"` and pins
  `outputFileTracingRoot` to the app folder so `server.js` is always at the top of `.next/standalone`.
  `public/` (brand, cursors, icons, handbook photos, og) is copied explicitly because standalone omits it.
- No secrets in images. `ENV=prod` is only a default; compose passes real values from `.env`.
- `.gitattributes` forces LF for `*.sh` and `Dockerfile` so the entrypoint cannot break on Windows checkouts.

## Verification status

Docker is not installed on the authoring machine, so the images were NOT built here. The CI `docker` job is
the first real build. Instead the same steps were run natively: `uv sync --frozen --no-dev` into a clean venv
and `entrypoint.sh serve` against a throwaway Postgres database and moto S3 (migrations, seeding, healthz,
`/docs` hidden in prod, purge and cleanup jobs via the entrypoint), and `pnpm install --frozen-lockfile`
plus `next build` plus `node server.js` from a copy of `app/` filtered like `app/.dockerignore`.
Not provable natively: base image tags, apt/musl details, uid/permissions, HEALTHCHECK timing, and
completeness of the traced standalone `node_modules` (Windows could not create pnpm symlinks when Next
copied them).
