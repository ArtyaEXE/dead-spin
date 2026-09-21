# syntax=docker/dockerfile:1.7
#
# API Dead Spin. Контекст сборки — корень монорепо:
#   docker build -f apps/api/Dockerfile -t dead-spin-api .
#
# Стадии: deps (установка по lockfile) → build (tsup) → runtime (только
# прод-зависимости API, non-root, healthcheck). Миграции накатываются
# на старте контейнера — на бесплатных тарифах нет отдельного pre-deploy шага.

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.12.0

# ─── deps ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo
ENV CI=1

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/levels/package.json packages/levels/
COPY packages/engine/package.json packages/engine/
COPY apps/game/package.json apps/game/

# --ignore-scripts: в образе нет git, а корневой prepare ставит lefthook.
# Нативных postinstall у зависимостей API нет — esbuild и sharp сюда не входят.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter "@dead-spin/api..."

# ─── build ─────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/levels packages/levels
COPY packages/engine packages/engine
COPY apps/api apps/api

RUN pnpm --filter @dead-spin/api build \
 && pnpm --filter @dead-spin/api deploy --prod --ignore-scripts /out

# ─── runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
ARG GIT_SHA=dev
ENV NODE_ENV=production \
    PORT=3001 \
    APP_VERSION=${GIT_SHA}
WORKDIR /app

COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
COPY --from=build --chown=node:node /out/drizzle ./drizzle

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["sh", "-c", "node dist/migrate.js && exec node dist/index.js"]
