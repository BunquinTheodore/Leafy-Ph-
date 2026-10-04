# syntax=docker/dockerfile:1

# Leafy web image (Next.js standalone). Build context is ./app (see docker-compose.yml).
ARG NODE_VERSION=24.7.0
ARG PNPM_VERSION=12.8.1

# ---- deps: install from the lockfile, cached until it changes ----
FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build: next build with output: "standalone" (set in next.config.ts) ----
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm build

# ---- runtime: only the traced server, static assets and public files ----
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/robots.txt').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
