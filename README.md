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
.\scripts\dev\run-all.ps1                 # 3. Postgres, S3, migrations, seed, API, web build and server
start http://127.0.0.1:3000               # 4. the app (API docs: :8000/docs)
.\scripts\dev\run-all.ps1 -Stop           # 5. stop everything
```

`run-all.ps1` is idempotent: it starts what is not running, runs `alembic upgrade head` and
`python -m app.seeds`, starts the API on `:8000` and the Next.js production build on `:3000`
with throwaway local secrets, `GOOGLE_MOCK=1`, `NEXT_PUBLIC_AUTH_MOCK=1` and `ML_SERVICE=dev-fake`. Logs are in `.dev/logs`.

The real classifier is written separately. Until it is plugged in, `ML_SERVICE=dev-fake` returns a
label picked from the image hash so the whole scan journey can be exercised. It logs a loud
`DEV ONLY` warning and refuses to start when `ENV=prod`. Run `-MlService stub` to see the real
behaviour without a model: every scan fails with "Analysis isn't available right now".

| Switch | Effect |
|---|---|
| `-MlService stub` | use the unimplemented model stub instead of `dev-fake` |
| `-SkipBuild` | reuse the last `next build` |
| `-E2E` | rate limits off, plus a second stack with `ML_SERVICE=stub` (API `:8001`, web `:3001`) |
| `-Stop` | stop the API, web servers and the dev services |

### Full stack tests

```powershell
.\scripts\dev\run-all.ps1 -E2E            # real Postgres, S3, API and web build
cd app; pnpm test:e2e:full                # register to scan to delete, auth, Google, account, ownership, layout
```

These Playwright specs (`app/e2e/full`) upload photos from `api/app/seeds/plant_photos`, check S3 objects are purged after an account
deletion, and assert the layout rules at 360, 768 and 1440 pixels. Use `.\scripts\dev\run-all.ps1 -E2E -SkipBuild`
to restart the servers without rebuilding. Sign in with Google in this setup goes through the mock
mode: the Firebase popup is replaced by a local fake that issues a test signed ID token for the chosen email, and the API
accepts that token only because `GOOGLE_MOCK=1` (never in `ENV=prod`).

### Every browser suite in one command

```powershell
cd app; pnpm e2e:all                      # build once, then auth, member, scan, ui and full, with a summary
pnpm e2e:all -- --only=auth,scan          # just some suites
pnpm e2e:all -- --skip-full               # skip the two suites that need the real stack
```

The auth, member and scan suites start and stop their own mock API and app server. The `ui`
(landing, handbook, design system) and `full` suites need the real stack: `e2e:all` starts it with
`run-all.ps1 -E2E`, shares it between both and stops it again (Postgres and S3 are left
running if they already were). An app already answering on `:3000` is reused, so stop a stack that
was built from other sources first. `pnpm screens:audit` (against a running stack) screenshots every
route at 1440, 768 and 390 pixels in both themes and reports layout problems.

## No email, and how to recover a password

Leafy sends no email at all: there is no SMTP server, no verification link, no password reset link and no notice mail. Registering with email and password signs you in immediately, and every signed in user can scan.

Forgot your password? Sign in with Google using the same email (it links to your account), then open Account and set a new password. This works because a session that came from a recent Google (Firebase) sign in, issued within the last 10 minutes, may set a new password without the current one (`POST /users/me/password`). A session older than that, or one that came from a password sign in, must send the current password as usual. If you have no Google account for that email there is no self service reset in v1, so ask the team to help.

## Docker quickstart

```bash
cp .env.example .env            # then change every secret
docker compose up -d --build    # postgres, minio, minio-init, api, purge, app
```

Open http://localhost:3000. The dev override file is loaded automatically (`ENV=dev`, ports for
the API, Postgres and MinIO bound to 127.0.0.1). For a production style run publish only
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
| `scripts/dev/` | PowerShell scripts for running Postgres and S3 natively |
| `docs/` | Plan, ML integration notes, PDF documentation |
| `docker-compose.yml` | Full stack. `docker-compose.override.yml` publishes dev ports |
| `.env.example` | Every environment variable, documented |

## Environment variables

All variables are documented inline in [`.env.example`](.env.example). Never commit a real `.env`.

| Group | Variables |
|---|---|
| Database | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Auth | `JWT_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `REFRESH_FAMILY_MAX_DAYS`, `REFRESH_GRACE_SECONDS` |
| Storage | `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_SCANS_BUCKET`, `S3_CATALOG_BUCKET` |
| ML | `ML_SERVICE` |
| Limits | `MAX_UPLOAD_BYTES`, `SCAN_QUOTA` |
| Web wiring | `API_INTERNAL_URL`, `APP_ORIGIN`, `COOKIE_SECURE`, `COOKIE_PREFIX` |
| Client address | `WEB_TRUSTED_PROXY_HOPS`, `API_TRUSTED_PROXY_HOPS` (compose names for `TRUSTED_PROXY_HOPS` in the app and the API). Required for per IP rate limits: see [`.env.example`](.env.example) |
| Google sign in (Firebase Auth) | API: `FIREBASE_PROJECT_ID`, `GOOGLE_MOCK`. Web (build time, public): `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, optional `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_AUTH_MOCK`. See [Google sign in setup](#google-sign-in-setup) |
| Runtime mode | `ENV` (compose defaults to `prod`; the dev override file sets `dev`). In `prod` the API hides `/docs`, enables HSTS and refuses `GOOGLE_MOCK=1` and `ML_SERVICE=dev-fake` |

`S3_PUBLIC_ENDPOINT` is read by both services. The API signs presigned photo URLs against it, and the web app adds its origin to the CSP `img-src` directive, so browsers may load scan photos and catalog images from the storage host and nowhere else. Set the same value for `api` and `app` (docker-compose passes it to both). If it is empty or not a plain http(s) URL, no extra image origin is allowed and storage photos will not render.

## Native dev without Docker (Windows)

Uses a project local Postgres 17 on port **5433** (never 5432), a local S3 server. All state lives in `.dev/` (gitignored).

```powershell
.\scripts\dev\dev-up.ps1     # init Postgres, start Postgres and S3
.\scripts\dev\dev-down.ps1   # stop them
```

Individual scripts: `init-postgres.ps1`, `start-postgres.ps1`, `stop-postgres.ps1`, `start-s3.ps1`. Requires the PostgreSQL 17 binaries (set `PG_BIN` if they are not in `C:\Program Files\PostgreSQL\17\bin`). The dev database password is a throwaway default, override with `LEAFY_DEV_PG_PASSWORD`.

| Service | Address |
|---|---|
| Postgres | `127.0.0.1:5433`, db `leafy`, user `leafy` |
| S3 API | `127.0.0.1:9000` (buckets `leafy-scans`, `leafy-catalog`) |

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
- [ ] Google sign in: enable Google in Firebase Auth, add the production domain to the authorized domains, restrict the browser API key, set `FIREBASE_PROJECT_ID` and the `NEXT_PUBLIC_FIREBASE_*` build values, and keep `GOOGLE_MOCK=0` and `NEXT_PUBLIC_AUTH_MOCK=0` (see below).
- [ ] ML: plug the real model in with `ML_SERVICE=package.module:ClassName` (see below).
- [ ] Set `S3_PUBLIC_ENDPOINT` to the real public storage host for both `api` and `app`.
- [ ] Photo provenance and licensing check for the handbook images.

## Google sign in setup

Google sign in uses **Firebase Authentication**. The browser loads the Firebase JS SDK (`firebase/app` and `firebase/auth` only, lazy loaded on the sign in and register pages after the user clicks "Continue with Google"), opens the Google popup (a redirect if the popup is blocked), and gets a Firebase ID token. The web app posts that token to the Next route handler `/api/auth/google` (same origin checked), which calls FastAPI `POST /api/v1/auth/google {id_token}`. FastAPI verifies the token itself: RS256 signature against Google's public `securetoken` certificates (cached, rotated), `iss`, `aud`, `exp`, `iat`, `auth_time`, `sub`, provider `google.com`, and a verified email. There is **no client secret, no service account and no Admin SDK**, and **no Firebase Analytics** (`measurementId` is intentionally not used).

### 1. Firebase console steps

1. Open the [Firebase console](https://console.firebase.google.com/) and select your project (this project: `leafy-8ecd6`).
2. **Authentication > Sign-in method**: choose **Google**, switch **Enable** on, set the **Project support email**, and save.
3. **Authentication > Settings > Authorized domains**: make sure `localhost` and your production domain are listed (add the production domain with **Add domain**). Sign in popups only work on authorized domains.
4. **Project settings (gear icon) > General > Your apps > Web app**: open **SDK setup and configuration** and copy `apiKey`, `authDomain`, `projectId`, `appId` (and optionally `storageBucket`, `messagingSenderId`). Ignore `measurementId`.

### 2. Restrict the browser API key

The web API key is a public identifier by design (it ships in the browser bundle), but restrict it so it cannot be abused:

1. [Google Cloud Console](https://console.cloud.google.com/) > select the same project > **APIs & Services > Credentials**.
2. Open the **Browser key** (auto created by Firebase).
3. **Application restrictions**: choose **Websites (HTTP referrers)** and add `http://localhost:3000/*` and `https://your-production-domain/*` (and `https://<project-id>.firebaseapp.com/*` for the auth handler).
4. **API restrictions** (optional): restrict to **Identity Toolkit API** and **Token Service API**.

### 3. Where each value goes

| Value | Variable | Goes in |
|---|---|---|
| Project id | `FIREBASE_PROJECT_ID` | `api/.env` (API verifier: `iss`/`aud` check). Empty disables Google sign in (`google_auth_failed`, reason `disabled`) |
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` | `app/.env.local`. Empty hides the Google button |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `app/.env.local` (also used for the CSP `frame-src`) |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `app/.env.local` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` | `app/.env.local` |
| `storageBucket`, `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | optional, `app/.env.local` |

`NEXT_PUBLIC_*` values are inlined into the browser bundle **at build time**, so rebuild the app after changing them. In Docker they are build args of the `app` image: put them in the root `.env` and run `docker compose up -d --build`. `app/.env.local` and `api/.env` are gitignored; the tracked `.env.example` files hold placeholders only, and CI uses placeholders too. If you ever paste real values into a tracked file, move them back out.

### 4. Content Security Policy

The strict nonce CSP allows only what the Firebase popup needs: `connect-src https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com`, `frame-src https://<authDomain> https://accounts.google.com`, and `https://apis.google.com` for scripts (the SDK popup helper). Nothing broader is opened and Google profile photos are not shown.

### 5. Mock mode (tests and local dev)

`GOOGLE_MOCK=1` (API and web server) with `NEXT_PUBLIC_AUTH_MOCK=1` (web, build time) replaces the Google popup with a local fake. Test ID tokens are signed with a test key that the API trusts only in mock mode, and **the API refuses to start in mock mode when `ENV=prod`**. Automated tests and `run-all.ps1` use it; real Google login needs your own Google account and is a manual check.

### Account rules

The identity key is the Firebase uid (`oauth_identity`, provider `google`). A verified Google email links to an existing password account with the same email; a Google only user can later set a password; deleting a Google only account needs the typed word DELETE after a fresh sign in.

## ML integration

The model is written separately. The API ships an abstract `MLInferenceService`, a stub that raises `NotImplementedError` (the API answers 503 `ml_unavailable`) and the contract `predict(image: bytes) -> dict[str, str]`. Plug in a real class with `ML_SERVICE=package.module:ClassName`. Details will live in `docs/ML_INTEGRATION.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
