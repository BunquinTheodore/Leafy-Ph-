# Contributing to Leafy

## Workflow

1. Branch from `main` (`feat/...`, `fix/...`). Never push straight to `main`.
2. Write the test first, watch it fail, make it pass, then refactor (TDD).
3. Keep CI green: it runs ruff, mypy and pytest for `api/`, and lint, format check, typecheck, test and build for `app/`, plus a gitleaks secrets scan.
4. Open a pull request with a short summary and a test plan.

## Commits

Conventional commits: `<type>: <description>` where type is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. Small commits, one per logical change. Do not skip hooks.

## Setup

```bash
pip install pre-commit && pre-commit install      # once
cd api && uv sync                                 # Python 3.12
cd app && pnpm install                            # Node 20+, pnpm
```

Native services without Docker (Windows): see the README section `Native dev without Docker`.

## Backend (`api/`)

- Layers: router (thin) to controller to service to repository. SQL only in repositories, business rules and transactions in services.
- Integration tests use a real Postgres through `pytest-postgresql` (a temporary instance, no credentials). If `pg_ctl` is not on your PATH, set `PG_CTL_PATH`.
- Storage tests use `moto`, email tests use a fake sender. Never use real credentials.
- Commands: `uv run ruff check . && uv run ruff format . && uv run mypy app && uv run pytest`.
- The ML implementation is out of scope here: only the abstract interface and the stub live in this repo.

## Frontend (`app/`)

- TypeScript strict, Tailwind, React 19, Next.js 15 (App Router). Secrets never use the `NEXT_PUBLIC_` prefix.
- Commands: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Follow the typography and layout rules in the plan: titles at most two lines, no hyphenation, panels instead of vertical scrolling.

## Code standards

- Immutable style: return new objects instead of mutating inputs.
- Files under 800 lines, functions under 50 lines, no deep nesting.
- Validate input at every boundary and handle errors explicitly. No hardcoded secrets, no debug prints.
- Target 80 percent test coverage or more.

## Security

Report vulnerabilities privately to the maintainers instead of opening a public issue. Never commit `.env` files or credentials. Rotate any secret that may have been exposed.
