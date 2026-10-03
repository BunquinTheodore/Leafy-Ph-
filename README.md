# Leafy

A plant doctor in your pocket. Snap a leaf, understand the disease, know what to do next.

Leafy is a monorepo: a Next.js app (`app/`), a FastAPI service (`api/`) and PostgreSQL. The browser only talks to Next.js, which proxies to the API. The leaf classifier itself is a separate piece written by the ML teammate and plugs in through a small interface.

> Status: scaffold. Quickstart commands below are placeholders until the API and app are complete.

## Quickstart (placeholder)

```bash
git clone https://github.com/BunquinTheodore/Leafy-Ph-.git && cd Leafy-Ph-
cp .env.example .env            # then edit the secrets
docker compose up -d --build    # postgres, minio, mailpit, api, purge, app
open http://localhost:3000      # app; Mailpit UI at :8025, MinIO console at :9001
docker compose logs -f api      # watch migrations and seeds run
```

No Docker? See [Native dev without Docker](#native-dev-without-docker-windows).

## Folder map

| Path | What lives there |
|---|---|
| `app/` | Next.js 15 App Router, TypeScript strict, Tailwind, React Three Fiber |
| `api/` | FastAPI, SQLAlchemy 2 async, Alembic, uv project |
| `scripts/dev/` | PowerShell scripts for running Postgres, MinIO and Mailpit natively |
| `docs/` | Plan, ML integration notes, PDF documentation |
| `docker-compose.yml` | Full stack. `docker-compose.override.yml` publishes dev ports |
| `.env.example` | Every environment variable, documented |

## Environment variables

All variables are documented inline in [`.env.example`](.env.example). Never commit a real `.env`.

| Group | Variables |
|---|---|
| Database | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Auth | `JWT_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `REFRESH_FAMILY_MAX_DAYS`, `REFRESH_GRACE_SECONDS`, `VERIFY_EMAIL_TTL_HOURS`, `RESET_PASSWORD_TTL_HOURS` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS`, `SMTP_FROM` |
| Storage | `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_SCANS`, `S3_BUCKET_CATALOG` |
| ML | `ML_SERVICE` |
| Limits | `MAX_UPLOAD_BYTES`, `SCAN_QUOTA` |
| Web wiring | `API_INTERNAL_URL`, `APP_ORIGIN`, `COOKIE_SECURE`, `COOKIE_PREFIX` |
| Google sign in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_MOCK` |

## Native dev without Docker (Windows)

Uses a project local Postgres 17 on port **5433** (never 5432), a local S3 server and Mailpit. All state lives in `.dev/` (gitignored).

```powershell
.\scripts\dev\dev-up.ps1     # init Postgres, download Mailpit, start Postgres, S3 and Mailpit
.\scripts\dev\dev-down.ps1   # stop them
```

Individual scripts: `init-postgres.ps1`, `start-postgres.ps1`, `stop-postgres.ps1`, `download-binaries.ps1`, `start-s3.ps1`, `start-mailpit.ps1`. Requires the PostgreSQL 17 binaries (set `PG_BIN` if they are not in `C:\Program Files\PostgreSQL\17\bin`). The dev database password is a throwaway default, override with `LEAFY_DEV_PG_PASSWORD`.

| Service | Address |
|---|---|
| Postgres | `127.0.0.1:5433`, db `leafy`, user `leafy` |
| S3 API | `127.0.0.1:9000` (buckets `leafy-scans`, `leafy-catalog`) |
| Mailpit SMTP / UI | `127.0.0.1:1025` / `http://127.0.0.1:8025` |

Note on MinIO: the upstream MinIO project is archived and its Windows binaries are no longer served (`410 Gone`). The native fallback therefore runs a `moto` S3 server from the api dev dependencies (in memory, data is lost on stop). If you place a `minio.exe` in `.dev\bin`, `start-s3.ps1` uses it instead. The Docker compose file pins the last community MinIO image; consider switching to Garage or RustFS before production.

## Running each part

```bash
# API
cd api && uv sync && uv run pytest && uv run ruff check .

# App
cd app && pnpm install && pnpm test && pnpm build
```

## Google sign in setup

To be written with the auth work. Local dev and tests use `GOOGLE_MOCK=1`, so nothing blocks until real credentials exist.

## ML integration

The model is written separately. The API ships an abstract `MLInferenceService`, a stub that raises `NotImplementedError` (the API answers 503 `ml_unavailable`) and the contract `predict(image: bytes) -> dict[str, str]`. Plug in a real class with `ML_SERVICE=package.module:ClassName`. Details will live in `docs/ML_INTEGRATION.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
