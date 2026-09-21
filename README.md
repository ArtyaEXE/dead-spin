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

## Команды

```bash
pnpm install                          # установить зависимости
pnpm typecheck                        # проверить типы во всём монорепо
pnpm test                             # все unit-тесты (engine + api)
pnpm validate:levels                  # прогнать 30 уровней через Zod-схему

# Клиент
pnpm --filter @dead-spin/game dev     # dev-сервер на :5173
pnpm --filter @dead-spin/game build   # прод-сборка в apps/game/dist

# API
docker compose up -d                  # поднять Postgres
cd apps/api && cp .env.example .env   # настроить ENV
pnpm --filter @dead-spin/api db:migrate   # применить миграции
pnpm --filter @dead-spin/api dev          # запустить API на :3001

# Уровни
pnpm --filter @dead-spin/levels exec tsx scripts/generate-pallas.ts   # перегенерировать PALLAS (L16–L30)
```

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
| POST | `/fuel/spend` | Списать топливо *(удаляется — топливо становится ресурсом уровня)* |
| GET  | `/leaderboard/:level` | Рейтинг по уровню + ранг игрока |
| GET  | `/leaderboard/:level/ghost` | Призрак глобального лидера |

## Статус

Ветка `standalone`: вся связь с Telegram и встроенный редактор удалены (2026-09-21).
Typecheck: 6 пакетов. 56 тестов зелёные (47 engine + 9 api). 30/30 уровней валидны.

| Пакет | Назначение | Тесты |
|---|---|---|
| `@dead-spin/shared` | Zod-схемы (Level, Decoration, Enemy, Ghost) + константы + ачивки | — |
| `@dead-spin/engine` | Физика, векторы, chunks, B-spline, fixed-timestep, heat мины | 47 |
| `@dead-spin/db` | Drizzle-схема | — |
| `@dead-spin/levels` | 30 JSON + loader + генератор | — |
| `@dead-spin/api` | Hono + Drizzle + JWT + device auth | 9 |
| `@dead-spin/game` | Клиент | — |

**Следующий этап:** GDD §19, этап A — фундамент (см. §17 «Известные проблемы»).

Легаси-документы `DEPLOY.md` и `SMOKE_TEST.md` описывают Telegram-альфу и будут
переписаны на этапе C (обёртка).
