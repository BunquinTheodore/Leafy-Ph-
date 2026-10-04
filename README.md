# Leafy

A plant doctor in your pocket. Snap a leaf, understand the disease, know what to do next.

Leafy is a monorepo: a Next.js app (`app/`), a FastAPI service (`api/`) and PostgreSQL. The browser only talks to Next.js, which proxies to the API. The leaf classifier itself is a separate piece written by the ML teammate and plugs in through a small interface.

## Quickstart (Windows, no Docker)

Needs Node 20+, pnpm, [uv](https://docs.astral.sh/uv/) and the PostgreSQL 17 binaries
(set `PG_BIN` if they are not in `C:\Program Files\PostgreSQL\17\bin`). From the repository root:

```powershell
git clone https://github.com/BunquinTheodore/Leafy-Ph-.git; cd Leafy-Ph-
cd api; uv sync; cd ..                    # 1. API dependencies
cd app; pnpm install; cd ..               # 2. web dependencies
.\scripts\dev\run-all.ps1                 # 3. Postgres, S3, Mailpit, migrations, seed, API, web build and server
start http://127.0.0.1:3000               # 4. the app (Mailpit inbox: http://127.0.0.1:8025, API docs: :8000/docs)
.\scripts\dev\run-all.ps1 -Stop           # 5. stop everything
```

`run-all.ps1` is idempotent: it starts what is not running, runs `alembic upgrade head` and
`python -m app.seeds`, starts the API on `:8000` and the Next.js production build on `:3000`
with throwaway local secrets, `GOOGLE_MOCK=1` and `ML_SERVICE=dev-fake`. Logs are in `.dev/logs`.

The real classifier is written separately. Until it is plugged in, `ML_SERVICE=dev-fake` returns a
label picked from the image hash so the whole scan journey can be exercised. It logs a loud
`DEV ONLY` warning and refuses to start when `ENV=prod`. Run `-MlService stub` to see the real
behaviour without a model: every scan fails with "Analysis isn't available right now".

| Switch | Effect |
|---|---|
| `-MlService stub` | use the unimplemented model stub instead of `dev-fake` |
| `-SkipBuild` | reuse the last `next build` |
| `-E2E` | rate limits off, 1 second email resend cooldown, plus a second stack with `ML_SERVICE=stub` (API `:8001`, web `:3001`) |
| `-Stop` | stop the API, web servers and the dev services |

### Full stack tests

```powershell
.\scripts\dev\run-all.ps1 -E2E            # real Postgres, S3, Mailpit, API and web build
cd app; pnpm test:e2e:full                # register to scan to delete, auth, Google, account, ownership, layout
```

These Playwright specs (`app/e2e/full`) read verification and reset emails from the Mailpit API,
upload photos from `api/app/seeds/plant_photos`, check S3 objects are purged after an account
deletion, and assert the layout rules at 360, 768 and 1440 pixels. Use `.\scripts\dev\run-all.ps1 -E2E -SkipBuild`
to restart the servers without rebuilding. Sign in with Google in this setup goes through the mock
provider: `/api/auth/google?email=someone@example.com` picks the identity.

### Every browser suite in one command

```powershell
cd app; pnpm e2e:all                      # build once, then auth, member, scan, ui and full, with a summary
pnpm e2e:all -- --only=auth,scan          # just some suites
pnpm e2e:all -- --skip-full               # skip the two suites that need the real stack
```

The auth, member and scan suites start and stop their own mock API and app server. The `ui`
(landing, handbook, design system) and `full` suites need the real stack: `e2e:all` starts it with
`run-all.ps1 -E2E`, shares it between both and stops it again (Postgres, S3 and Mailpit are left
running if they already were). An app already answering on `:3000` is reused, so stop a stack that
was built from other sources first. `pnpm screens:audit` (against a running stack) screenshots every
route at 1440, 768 and 390 pixels in both themes and reports layout problems.

## Docker quickstart

```bash
cp .env.example .env            # then change every secret
docker compose up -d --build    # postgres, minio, minio-init, mailpit, api, purge, app
```

Open http://localhost:3000. The dev override file is loaded automatically (`ENV=dev`, ports for
the API, Postgres, MinIO and Mailpit bound to 127.0.0.1). For a production style run publish only
the web app and let `ENV` default to `prod`:

```bash
docker compose -f docker-compose.yml up -d --build
```

What the images do:

| Image | Build context | Notes |
|---|---|---|
| `api/Dockerfile` | `./api` | `python:3.12.11-slim-bookworm`, `uv sync --frozen --no-dev` in a builder stage, runs as a non-root user (uid 10001). `entrypoint.sh serve` (the default) runs `alembic upgrade head`, `python -m app.seeds` (catalog rows plus photo upload to the catalog bucket), then uvicorn on port 8000. Any other command is exec'd as is. |
| `purge` service | `./api` (same image) | `python -m app.jobs.purge_storage --loop`. The loop also runs `cleanup_tokens` about hourly, so there is no separate cleanup service. Its image HEALTHCHECK is disabled in compose because it serves no HTTP. |
| `app/Dockerfile` | `./app` | `node:24.7.0-slim`, pnpm 12.8.1 installed from npm (corepack failed in CI) with `--frozen-lockfile`, `next build` with `output: "standalone"`, runtime stage copies `.next/standalone`, `.next/static` and `public`, runs `node server.js` as the non-root `node` user on port 3000. HEALTHCHECK requests `/robots.txt`. |

No secrets are baked in: `DATABASE_URL`, `JWT_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and the rest
arrive at run time from `.env` through compose. The web app reads its settings at run time, so
the same image works for any origin. The `docker` job in `.github/workflows/ci.yml` lints both
Dockerfiles with hadolint and builds both images.

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
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_STARTTLS`, `SMTP_FROM` |
| Storage | `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_SCANS_BUCKET`, `S3_CATALOG_BUCKET` |
| ML | `ML_SERVICE` |
| Limits | `MAX_UPLOAD_BYTES`, `SCAN_QUOTA` |
| Web wiring | `API_INTERNAL_URL`, `APP_ORIGIN`, `COOKIE_SECURE`, `COOKIE_PREFIX` |
| Client address | `WEB_TRUSTED_PROXY_HOPS`, `API_TRUSTED_PROXY_HOPS` (compose names for `TRUSTED_PROXY_HOPS` in the app and the API). Required for per IP rate limits: see [`.env.example`](.env.example) |
| Google sign in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_MOCK` |
| Runtime mode | `ENV` (compose defaults to `prod`; the dev override file sets `dev`). In `prod` the API hides `/docs`, enables HSTS and refuses `GOOGLE_MOCK=1` and `ML_SERVICE=dev-fake` |

`S3_PUBLIC_ENDPOINT` is read by both services. The API signs presigned photo URLs against it, and the web app adds its origin to the CSP `img-src` directive, so browsers may load scan photos and catalog images from the storage host and nowhere else. Set the same value for `api` and `app` (docker-compose passes it to both). If it is empty or not a plain http(s) URL, no extra image origin is allowed and storage photos will not render.

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

## Before launch: placeholders and TODO list

Details the team still has to supply live in one file, `app/src/lib/site-config.ts`. Each one shows
on the site as a visible `[TODO: ...]` marker, so nothing invented can ship unnoticed. A unit test
(`content.test.ts`) fails if a team name or the legal email stops being a clearly marked value
without being replaced on purpose. Replace the value and drop the brackets when you have the real one.

- [ ] `LEGAL_CONTACT_EMAIL` in `site-config.ts`: the contact address in the Privacy Policy and Terms of Use.
- [ ] `TEAM_MEMBERS` in `site-config.ts`: the three real names on the About page (product and web, machine learning, plant data).
- [ ] Privacy Policy and Terms of Use: the text is a plain language draft, get a legal review.
- [ ] Google sign in: create the OAuth client and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_MOCK=0`.
- [ ] ML: plug the real model in with `ML_SERVICE=package.module:ClassName` (see below).
- [ ] Set `S3_PUBLIC_ENDPOINT` to the real public storage host for both `api` and `app`.
- [ ] Photo provenance and licensing check for the handbook images.

## Google sign in setup

To be written with the auth work. Local dev and tests use `GOOGLE_MOCK=1`, so nothing blocks until real credentials exist.

## ML integration

The model is written separately. The API ships an abstract `MLInferenceService`, a stub that raises `NotImplementedError` (the API answers 503 `ml_unavailable`) and the contract `predict(image: bytes) -> dict[str, str]`. Plug in a real class with `ML_SERVICE=package.module:ClassName`. Details will live in `docs/ML_INTEGRATION.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
