# Dead Spin — инфраструктура

Локальная разработка, CI/CD, деплой и секреты. Дизайн — в [`docs/GDD.md`](docs/GDD.md).

## Архитектура окружений

```
┌──────────────────────┐   HTTPS   ┌──────────────────────────┐   TLS   ┌─────────────┐
│ Cloudflare Pages     │◀────────▶│ Render (Docker)          │◀───────▶│ Neon        │
│ apps/game — статика  │          │ dead-spin-api  /healthz  │         │ Postgres 16 │
└──────────────────────┘          └──────────────────────────┘         └─────────────┘
          ▲                                   ▲
          │ Git-интеграция Pages              │ deploy hook
          │ (production = main,               │ GitHub Actions, только main,
          │  preview = каждая ветка)          │ после зелёного CI
          └───────────────────────────────────┘
```

Игра офлайн-first (GDD §16.2): клиент работает без API, сервер хранит копию
прогресса, глобальные призраки и лидерборд. Падение API не ломает игру.

## Локальная разработка

```bash
pnpm install       # зависимости; prepare ставит git-хуки lefthook
pnpm setup         # apps/api/.env и apps/game/.env из .env.example
pnpm db:up         # Postgres 16 (docker compose, сервис postgres)
pnpm db:migrate    # drizzle-миграции из apps/api/drizzle
pnpm dev           # API на :3001 (tsx watch) + клиент на :5173 (vite, прокси /api → :3001)
```

Версии: Node 22 (`.nvmrc`), pnpm 9.12.0 (`package.json#packageManager`, `corepack enable`).
Локально Node 20 тоже работает, но `engines` и CI требуют 22.

Прод-образ API целиком, вместе с миграциями:

```bash
docker compose --profile full up --build   # postgres + api из apps/api/Dockerfile
curl http://localhost:3001/healthz          # {"ok":true,"env":"production","version":"dev"}
```

Если volume `pg-data` остался от прежней схемы (до разворота на standalone — 17 таблиц),
baseline-миграция на него не ляжет: `docker compose down -v` и заново. Прод-базы это не
касается — там схема создаётся с нуля.

## Качество кода

| Инструмент | Что | Где запускается |
|---|---|---|
| **Biome** | линт + формат (табы, одинарные кавычки, `{x}` без пробелов, 120 колонок) | `pnpm check`, pre-commit по staged, CI `biome ci` |
| **tsc** | типы во всех пакетах, `strict` + `noUncheckedIndexedAccess` | `pnpm typecheck`, pre-push, CI |
| **Vitest** | engine (физика, heat мины), api (рейтинг, профиль, дейлик) | `pnpm test`, pre-push, CI |
| **validate:levels** | Zod-схема + дизайн-инварианты уровней | CI |
| **lefthook** | pre-commit: Biome; pre-push: typecheck + test | ставится `pnpm install` |

Выключенные правила Biome и почему (`biome.json`):
- `a11y/useKeyWithClickEvents`, `noStaticElementInteractions`, `useSemanticElements` —
  тач-игра, интерфейс из картинок-кнопок без клавиатуры;
- `style/noNonNullAssertion` — код опирается на `!` при `noUncheckedIndexedAccess`;
- `complexity/noForEach`, `useLiteralKeys` — стиль проекта (`env['KEY']` под `noPropertyAccessFromIndexSignature`).

Обойти хук в крайнем случае: `LEFTHOOK=0 git commit`.

## CI — `.github/workflows/ci.yml`

Запускается на push в любую ветку кроме `main` и на каждый PR. Один job `check`:
Biome → typecheck → test → validate:levels → build API (tsup) → build web (vite) →
артефакт `web-dist`. Отдельный job `docker` собирает образ API без публикации —
ловит поломку Dockerfile до деплоя.

`workflow_call` позволяет `deploy.yml` переиспользовать его целиком.

## CD — `.github/workflows/deploy.yml`

Только push в `main`. Сначала полный CI, затем **api → Render**: `POST` на Deploy Hook.
Render собирает `apps/api/Dockerfile` сам (`render.yaml`, `runtime: docker`,
`autoDeploy: false` — деплой только после CI). Job в environment `production`.

**Веб — Cloudflare Pages по Git-интеграции**, вне GitHub Actions: production собирается
с `main`, preview — с каждой ветки (`<ветка>.dead-spin.pages.dev`) и виден в проверках PR.
Настройки проекта Pages (дашборд → Workers & Pages → dead-spin → Settings):
- Build command `pnpm --filter @dead-spin/game build`, output `apps/game/dist`, Node 22;
- Environment variables (production **и** preview): `VITE_API_BASE=https://dead-spin-api.onrender.com`.
Без переменной клиент обращается к `/api` относительно pages.dev и получает 404.

### Секреты и переменные репозитория

Settings → Secrets and variables → Actions.

| Тип | Имя | Откуда |
|---|---|---|
| secret | `RENDER_DEPLOY_HOOK_URL` | Render → dead-spin-api → Settings → Deploy Hook |
| variable | `VITE_API_BASE` | публичный URL API, `https://dead-spin-api.onrender.com`, без слеша |

### Переменные окружения API (Render → Environment)

| Ключ | Значение |
|---|---|
| `DATABASE_URL` | Neon pooled connection string, `?sslmode=require` |
| `JWT_SECRET` | ≥ 32 байт, `generateValue: true` в blueprint |
| `CORS_ORIGINS` | `https://dead-spin.pages.dev` для прода; `*` допустимо — API на Bearer-токене без cookies, а preview-домены Pages меняются с каждой веткой |
| `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST` | опционально, пусто = выключено |

`PORT` инжектит Render; `APP_VERSION` попадает в образ из `GIT_SHA` при сборке.

## Docker-образ API — `apps/api/Dockerfile`

Три стадии: `deps` (установка по lockfile с `--ignore-scripts`, только граф `@dead-spin/api`),
`build` (tsup бандлит `src/index.ts` и `scripts/migrate-db.ts` в `dist/`, workspace-пакеты
внутрь; `pnpm deploy --prod` вырезает прод-зависимости), `runtime` (node:22-alpine, non-root
`node`, healthcheck на `/healthz`). Старт: `node dist/migrate.js && exec node dist/index.js` —
миграции перед сервером, потому что на free-тарифе Render нет pre-deploy шага.

`tsx` больше не в прод-зависимостях: раньше TypeScript транспилировался на каждом холодном
старте.

## Первичная настройка облака

1. **Neon**: проект `dead-spin`, регион EU → pooled connection string.
2. **Render**: New → Blueprint → репозиторий → `render.yaml` → заполнить `DATABASE_URL`,
   `CORS_ORIGINS`. После создания сервиса: Settings → Deploy Hook → в секрет репозитория.
3. **Cloudflare Pages**: Workers & Pages → Create → Pages → Connect to Git → репозиторий;
   build command / output / Node и `VITE_API_BASE` — см. раздел CD. Первый деплой — push в `main`.
4. **GitHub**: Settings → Environments → `production`; Branches → protection для `main`
   (require CI, require PR).
5. **UptimeRobot** (по желанию): пинг `/healthz` раз в 5 мин, чтобы free-инстанс не засыпал.

## Ветки

`main` — релизная, деплоится автоматически. Работа — в feature-ветках через PR;
`standalone` — текущая ветка разворота, вливается в `main` через PR, когда закрытый тест
(GDD §19, этап D) пройден.

## Мобильные сборки

Этап C (GDD §19): Capacitor iOS/Android. Пайплайн для них — отдельный workflow с
`workflow_dispatch`, TestFlight / Internal testing; добавится вместе с обёрткой.
