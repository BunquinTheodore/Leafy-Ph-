# 🌿 Leafy: A Plant Leaf Disease Classifier

Leafy PH is a web application for preliminary plant leaf disease screening. A signed-in user can upload or take a photo of a leaf, review the suggested result, and revisit past scans. Anyone can browse the plant and disease handbook for symptoms, reference photos, treatment, and prevention information.

A scan can return a suggested disease, a healthy result, or an unknown result. The classifier is limited to its supported labels, and lighting, image quality, and symptoms that look alike can affect the result. Use the result as a starting point when checking the handbook.

## ✨ Features

- **Leaf screening.** Submit a JPEG, PNG, or WebP photo. The default upload limit is 8 MiB. The API validates the image, removes metadata during re-encoding, and queues it for analysis.
- **Public handbook.** Search plants and diseases, read symptom and treatment guidance, and view zoomable reference photos. The catalog contains 13 plants and 27 disease entries. Classifier coverage differs from handbook coverage.
- **Member tools.** View recent scans and statistics, filter scan history, retry eligible failed scans, and submit corrections on completed scans.
- **Accounts.** Register with email and password or use Google sign-in when Firebase is configured. Members can update their profile and delete their account.

## 🐳 Quickstart with Docker

**Docker is the recommended way to run Leafy PH with real predictions.** The API image includes the MobileNetV2 classifier and its weights. It also downloads the optional CLIP leaf-check model during the first build, so allow extra time and keep an internet connection available.

To get started, install Git and Docker Compose 2.24.4 or later, then clone the repository and copy the environment template. The API image build downloads the CLIP model from Hugging Face, so allow time and network access for the first build.

```bash
git clone https://github.com/BunquinTheodore/Leafy-Ph-.git
cd Leafy-Ph-
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` for the last step.

1. Edit the root `.env`. Replace `JWT_SECRET` with a random value of at least 32 characters. Replace the example PostgreSQL and MinIO credentials. Keep the PostgreSQL credentials in `DATABASE_URL` consistent with `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Keep the application S3 credentials separate from the MinIO root credentials.
2. Keep the `ML_SERVICE` value from `.env.example` to use the bundled classifier. For local email-and-password testing, the Firebase settings can remain empty.
3. Build and start the stack from the repository root.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Open [Leafy at localhost:3000](http://localhost:3000). Browse the handbook, create a test account, and upload a clear photo of one leaf to check the end-to-end flow.

| Local service | Address |
| --- | --- |
| Web app | `http://localhost:3000` |
| Interactive API documentation | `http://127.0.0.1:8000/docs` |
| API health and database readiness | `http://127.0.0.1:8000/api/v1/healthz` and `/api/v1/readyz` on the same host |
| PostgreSQL | `127.0.0.1:5432` |
| MinIO API and console | `127.0.0.1:9000` and `127.0.0.1:9001` |

The development override publishes the API and PostgreSQL ports on loopback. The base file also binds MinIO to loopback. On startup, `minio-init` prepares the buckets, then the API runs migrations and seeds the catalog and reference photos. The `purge` service handles queued object cleanup and expired refresh tokens.

```bash
docker compose logs --tail=100 api app
docker compose down
```

`docker compose down` keeps the database and object-storage volumes.

## 🪟 Native dev without Docker

The PowerShell scripts require **Windows**, **Node.js 20 or later**, **pnpm 12.8.1**, **uv**, and **PostgreSQL 17** binaries. The API uses **Python 3.12**, which uv can install when it resolves the project environment. If PostgreSQL is installed outside the default directory, set `PG_BIN` to the directory containing its executables.

Run these commands from the repository root after cloning.

```powershell
Push-Location api
uv sync --frozen
Pop-Location

Push-Location app
pnpm install --frozen-lockfile
Pop-Location

.\scripts\dev\run-all.ps1
```

Open [Leafy at 127.0.0.1:3000](http://127.0.0.1:3000). The script starts PostgreSQL on port 5433, object storage on port 9000, FastAPI on port 8000, and the Next.js production build on port 3000. It runs migrations and seeds on startup. Local logs and service files are under `.dev/`.

The native script enables mock Google sign-in and uses `dev-fake`, which generates deterministic sample predictions for development. Use the Docker quickstart for the bundled MobileNetV2 classifier. The native S3 service uses `.dev/bin/minio.exe` if present, otherwise it uses Moto. Moto storage is in memory and is cleared when the service stops.

| Script option | Effect |
| --- | --- |
| `-MlService stub` | Start the stack with analysis unavailable so the fallback flow can be tested. |
| `-E2E` | Disable rate limits and add a second web/API pair on ports 3001 and 8001 for the unavailable-analysis tests. |
| `-SkipBuild` | Reuse the previous Next.js build. |
| `-Stop` | Stop the local services. Add `-KeepInfra` to leave PostgreSQL and object storage running. |

## 🏗️ Architecture and project layout

Next.js renders pages and forwards application API requests to FastAPI. FastAPI handles authentication, catalog queries, scan storage, and background inference. The browser loads handbook images and signed scan-image URLs from the configured storage endpoint.

| Path | Responsibility |
| --- | --- |
| [`app/`](app/) | Next.js App Router, React, TypeScript, Tailwind CSS, web routes, and browser tests |
| [`api/`](api/) | FastAPI routes and services, PyTorch inference, SQLAlchemy, Alembic migrations, and catalog seeds |
| [`scripts/dev/`](scripts/dev/) | Local PowerShell setup and end-to-end services |
| [`docker-compose.yml`](docker-compose.yml) | Web, API, PostgreSQL, MinIO, and cleanup services |
| [`docs/`](docs/) | Deployment, machine learning, performance, and test documentation |

### 🔌 API reference

FastAPI endpoints use the `/api/v1` prefix. The health endpoint checks that the process responds. Readiness also checks the database. Use `/docs` on the development API for endpoint and schema details, or browse the tracked [OpenAPI specification](api/openapi.json).

To refresh the specification and frontend API types after a contract change, run the first command from `api/` and the second from `app/`.

```bash
uv run python -m app.tools.export_openapi
pnpm api:types
```

## ⚙️ Configuration

Docker Compose reads [the root environment template](.env.example). For manually started services, use the [API template](api/.env.example) as `api/.env` and the [web template](app/.env.example) as `app/.env.local`. Keep actual credentials out of version control.

| Settings | Purpose |
| --- | --- |
| `DATABASE_URL`, `POSTGRES_*`, `JWT_SECRET` | Database access and API token signing |
| `API_INTERNAL_URL`, `APP_ORIGIN` | Server-side API address and exact public web origin |
| `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT` | Internal storage address and browser-reachable origin for images and signed URLs |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_SCANS_BUCKET`, `S3_CATALOG_BUCKET` | Scoped storage credentials and the private scan and public catalog buckets |
| `ML_SERVICE`, `ML_LEAF_GATE` | Inference adapter and optional CLIP leaf check |
| `MAX_UPLOAD_BYTES`, `SCAN_QUOTA` | Upload limit and maximum saved scans per account |
| `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_*` | Optional Google sign-in configuration |
| `ENV`, `COOKIE_SECURE`, `COOKIE_PREFIX` | Runtime mode and cookie settings |
| `WEB_TRUSTED_PROXY_HOPS`, `API_TRUSTED_PROXY_HOPS` | Number of trusted proxies for each service when running under Compose |

Set `S3_PUBLIC_ENDPOINT` to the same browser-reachable origin in both services. The API uses it for image URLs, and Next.js allows that origin in its image policy. A Compose hostname such as `minio` is appropriate for `S3_ENDPOINT_URL` inside the network.

### 🔐 Google sign-in setup

1. Enable the Google provider in Firebase Authentication. Add the hostname you use to access the app to the authorized domains.
2. Set `FIREBASE_PROJECT_ID` for FastAPI. Copy the Firebase web app's `apiKey`, `authDomain`, `projectId`, and `appId` to the matching `NEXT_PUBLIC_FIREBASE_*` values for Next.js. Both services must use the same Firebase project.
3. Rebuild the web app after changing any `NEXT_PUBLIC_*` values. Use `GOOGLE_MOCK=0` and `NEXT_PUBLIC_AUTH_MOCK=0` for real Google sign-in.

The Firebase JS SDK obtains the ID token in the browser. FastAPI verifies it with Google's public signing certificates. A verified Google sign-in can link to an existing account with the same email. Within 10 minutes of that sign-in, the user can set a password from **Account** without entering the previous one. Leafy has no email verification or password-reset email flow.

### 🧠 Machine learning

Leafy PH uses MobileNetV2 to suggest a plant or disease result from an uploaded leaf photo. When enabled, the CLIP leaf check screens the image before classification.

#### Using a different model

The bundled classifier is ready to use with the default Docker configuration. If you want to try different weights or a different model architecture, you can configure the API to use either:

- **Compatible MobileNetV2 weights.** Set `MODEL_PATH` in the API environment to point to your checkpoint.
- **A different model architecture.** Implement `MLInferenceService` and set `ML_SERVICE` to your adapter’s `package.module:ClassName`. Map its outputs to Leafy PH’s supported plant and disease labels.

For Docker, make the weights available inside the API container and pass any custom settings through a Compose override. Rebuild the API image if you add adapter code or dependencies. See the [ML integration guide](docs/ML_INTEGRATION.md) for the interface and supported labels.

The bundled [MobileNetV2 adapter](api/app/services/ml/pytorch_ml_inference.py) loads the repository's `mobilenetv2_plant.pth` weights and maps PlantVillage labels to the Leafy handbook. With the leaf check enabled, `openai/clip-vit-base-patch32` screens the photo before disease classification. Docker downloads the CLIP assets during image build and loads them offline at runtime from `/opt/hf-cache`.

- **Bundled classifier:** `ML_SERVICE=app.services.ml.pytorch_ml_inference:PytorchMLInferenceService`
- **Local demo mode:** `ML_SERVICE=dev-fake`, available for development. Sample results exercise the scan workflow.
- **Unavailable analysis:** `ML_SERVICE=stub`, useful for testing the unavailable-result flow.

The adapter reads `ML_GATE_THRESHOLD` and defaults to `0.5`. The stock Compose file forwards `ML_LEAF_MIN_PROB` instead of `ML_GATE_THRESHOLD`. Setting only `ML_GATE_THRESHOLD` in the root `.env` leaves the container on the adapter’s default threshold. For custom weights or an alternate adapter, see the [ML integration contract](docs/ML_INTEGRATION.md).

## 🧪 Tests and checks

From `api/`:

```bash
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Integration tests use a temporary PostgreSQL instance through `pytest-postgresql`. Install PostgreSQL server binaries and make `pg_ctl` available, or set `PG_CTL_PATH`. Run `uv run pytest -m tc --no-cov` for cases tagged in the [test-case record](docs/test-cases.md).

From `app/`:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For browser tests, install Chromium once with `pnpm exec playwright install chromium` from `app/`.

- `pnpm e2e:all -- --skip-full` runs the suites backed by mock services.
- For the full-stack suite on Windows, run `.\scripts\dev\run-all.ps1 -E2E` from the root, followed by `pnpm test:e2e:full` from `app/`.
- `pnpm e2e:all` runs the full suite set. The runner can launch the Windows test stack or reuse one that is already running.

See the [CI workflow](.github/workflows/ci.yml) for automated checks. For layout audits and performance checks, see the [performance guide](docs/PERFORMANCE.md).

## 🚀 Deployment notes

Use the base Compose file to avoid loading the development override. Set the production environment and credentials before starting the services.

```bash
docker compose -f docker-compose.yml up -d --build
```

Set `ENV=prod`, use the site’s HTTPS URL for `APP_ORIGIN`, and enable secure cookies. Keep both Google mock flags off. PostgreSQL and FastAPI are internal to the Compose network in this setup, and MinIO's published ports stay on loopback. Configure a browser-reachable HTTPS storage origin for `S3_PUBLIC_ENDPOINT` when deploying for remote users. Production mode disables the interactive FastAPI documentation.

The About, Privacy, and Terms pages take their contact and team details from [`site-config.ts`](app/src/lib/site-config.ts). Fill in the published contact and team information and review handbook image attribution before releasing the service.

## 📚 Further reading

- [Contributing guide](CONTRIBUTING.md)
- [Docker image notes](docs/DOCKER.md)
- [Model integration contract](docs/ML_INTEGRATION.md)
- [Handbook photo credits](api/app/seeds/images/SOURCES.md)
- [Technical documentation source and PDF build](docs/pdf/README.md)
