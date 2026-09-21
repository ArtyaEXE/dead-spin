# Dead Spin

Однокнопочная физическая аркада: корабль вращается сам, игрок выбирает момент импульса.
Самостоятельная игра для App Store / Google Play. Дизайн, экономика и roadmap — в
[`docs/GDD.md`](docs/GDD.md) (v2.0).

## Стек

| Слой | Выбор |
|---|---|
| Клиент | Vite + TypeScript + Solid.js + PixiJS v8 |
| Мобильная обёртка | Capacitor (план, см. GDD §16) |
| API | Hono + Node 22 + Drizzle ORM + PostgreSQL |
| Валидация | Zod (общая для клиента и сервера) |
| Тесты | Vitest |
| Пакетный менеджер | pnpm workspaces |

## Структура

```
dead-spin/
├─ apps/
│  ├─ game/     — клиент игры (Vite + Solid + Pixi)
│  └─ api/      — Hono + Drizzle + Postgres
├─ packages/
│  ├─ engine/   — чистая TS-физика, fixed-timestep loop, векторы, heat мины
│  ├─ shared/   — Zod-схемы, типы, константы
│  ├─ db/       — Drizzle-схема (6 таблиц)
│  └─ levels/   — 30 JSON-уровней + loader + валидатор + генератор пещер
├─ docs/GDD.md  — дизайн-документ
└─ docker-compose.yml   — Postgres для локалки
```

## Быстрый старт

```bash
pnpm install          # зависимости + git-хуки (lefthook)
pnpm setup            # .env из .env.example там, где их нет
pnpm db:up            # Postgres 16 в Docker
pnpm db:migrate       # накатить схему
pnpm dev              # API :3001 + клиент :5173 одной командой
```

Требуется Node 22 (`.nvmrc`), pnpm 9.12 (`packageManager`, через corepack), Docker.

## Команды

```bash
pnpm check            # Biome: линт + формат (в CI — biome ci)
pnpm check:fix        # то же с автофиксами
pnpm typecheck        # tsc по всем пакетам
pnpm test             # Vitest (engine + api)
pnpm validate:levels  # схема + дизайн-инварианты 30 уровней
pnpm build            # прод-сборки: API (tsup → dist/) и клиент (vite → dist/)
pnpm ci               # всё вышеперечисленное, как в CI

pnpm --filter @dead-spin/levels exec tsx scripts/generate-pallas.ts   # перегенерировать PALLAS (L16–L30)
pnpm --filter @dead-spin/levels exec tsx scripts/tune-curve.ts        # звёзды с прямой + мины в пустые уровни
pnpm --filter @dead-spin/levels exec tsx scripts/inject-par.ts        # пересчитать fuelTank/par по маршрутам
pnpm optimize:assets                                                  # пережать картинки под размеры отрисовки

docker compose --profile full up   # прод-образ API локально вместе с Postgres
```

Хуки: pre-commit — Biome по staged-файлам, pre-push — typecheck + test. Деплой и CI — в [`DEPLOY.md`](DEPLOY.md).

## Эндпоинты API

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/auth/device` | Анонимный вход по UUID устройства → JWT (7 дней) |
| GET  | `/healthz` | Health check |
| GET  | `/me` | Текущий юзер |
| GET/POST | `/me/daily` | Дневной бонус |
| POST | `/me/skin`, `/me/tutorial-seen`, `/me/spend-coins` | Состояние игрока |
| GET  | `/me/achievements` | Ачивки |
| GET  | `/progress` | Прогресс: сумма звёзд + рекорды по уровням |
| POST | `/progress/level-complete` | Записать прохождение (+ ghost-запись) |
| GET  | `/leaderboard/:level` | Рейтинг по уровню + ранг игрока |
| GET  | `/leaderboard/:level/ghost` | Призрак глобального лидера |

## Статус

Ветка `standalone`: вся связь с Telegram и встроенный редактор удалены (2026-09-21).
Typecheck: 6 пакетов. 74 теста зелёные (47 engine + 27 api). 30/30 уровней валидны (6 с предупреждением по крюку).

| Пакет | Назначение | Тесты |
|---|---|---|
| `@dead-spin/shared` | Zod-схемы (Level, Decoration, Enemy, Ghost) + константы + ачивки | — |
| `@dead-spin/engine` | Физика, векторы, chunks, B-spline, fixed-timestep, heat мины | 47 |
| `@dead-spin/db` | Drizzle-схема | — |
| `@dead-spin/levels` | 30 JSON + loader + генератор | — |
| `@dead-spin/api` | Hono + Drizzle + JWT + device auth | 27 |
| `@dead-spin/game` | Клиент | — |

**Этап A (фундамент) завершён 2026-09-21. Следующий:** GDD §19, этап B — режимы (бесконечный, испытание дня, continue, призрак себя, near-miss).

Инфраструктура: [`DEPLOY.md`](DEPLOY.md) — локалка, CI/CD, секреты, Docker; [`SMOKE_TEST.md`](SMOKE_TEST.md) — ручной чеклист перед выкладкой.
