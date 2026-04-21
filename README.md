# Dead Spin

Telegram Mini App game — переписка со стека Meteor 3 + Svelte + Mongo на современный.

## Стек

| Слой | Выбор |
|---|---|
| Фронт (игра) | Vite + TypeScript + Solid.js + PixiJS v8 |
| Фронт (редактор уровней) | Vite + Solid + Konva |
| Бэк API | Hono + Node 22 + Drizzle ORM + PostgreSQL |
| Бэк бот | grammY (webhook) |
| Шина данных | Redis (rate-limit, leaderboards) |
| Валидация | Zod (общая для клиента и сервера) |
| Тесты | Vitest + Playwright |
| Пакетный менеджер | pnpm workspaces |

## Структура

```
dead-spin/
├─ apps/
│  ├─ game/     — Telegram Mini App (Vite + Solid + Pixi)
│  ├─ api/      — Hono + Drizzle + Postgres
│  ├─ bot/      — grammY (polling/webhook)
│  └─ editor/   — редактор уровней (Konva)
├─ packages/
│  ├─ engine/   — чистая TS-физика, fixed-timestep loop, векторы
│  ├─ shared/   — Zod-схемы, типы, константы
│  ├─ db/       — общие Drizzle-таблицы (используются api и bot)
│  └─ levels/   — 15 JSON-уровней + loader + валидатор
└─ docker-compose.yml   — Postgres + Redis для локалки
```

## Команды

```bash
pnpm install                          # установить зависимости
pnpm typecheck                        # проверить типы во всём монорепо
pnpm test                             # все unit-тесты (engine + api)
pnpm validate:levels                  # прогнать 15 уровней через Zod-схему

# API
docker compose up -d                  # поднять Postgres + Redis
cd apps/api && cp .env.example .env   # настроить ENV
pnpm --filter @dead-spin/api db:migrate      # применить миграции
pnpm --filter @dead-spin/api dev             # запустить API на :3001
pnpm --filter @dead-spin/api migrate:mongo   # одноразовый перенос из старой Mongo
```

## Эндпоинты API (Фаза 2)

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/auth/telegram` | Логин по Telegram initData → JWT (7 дней) |
| GET  | `/healthz` | Health check |
| GET  | `/me` | Текущий юзер (с регенерированным fuel) |
| GET  | `/progress` | Прогресс: summary + рекорды по уровням |
| POST | `/progress/level-complete` | Отметить прохождение уровня |
| POST | `/fuel/spend` | Списать топливо |
| GET  | `/leaderboard/:level` | Рейтинг по уровню + ранг текущего игрока |

## Telegram-бот (Фаза 3)

`apps/bot` на **grammY**, красивый UI:

- **HTML-форматирование** везде, emoji-иерархия (🚀 ⛽ ⭐ 💰 🏁 🏆 💎 ⚙️ ❓)
- **Inline-клавиатуры** + `editMessageText` — одно сообщение, не спамит
- **Прогресс-бар топлива** `█████░░░░░` в карточке статы
- **Лидерборд с переключением уровней** `◀ 1/15 ▶`, подсветка своего ника
- **FAQ в expandable-blockquotes** — сворачиваемые ответы
- **Магазин XTR** — лоты с ценой в Stars, инвойс по кнопке
- **i18n ru/en** — смена языка прямо в настройках
- **Идемпотентные платежи** — уникальный индекс по `tg_charge_id`, дубли не начисляются

**Команды:** `/start`, `/menu`, `/home`, `/help`, `/shop`

### Что нужно для запуска бота

1. Создай бота у [@BotFather](https://t.me/BotFather): `/newbot` → получи `TELEGRAM_BOT_TOKEN`
2. Включи платежи Stars: BotFather → `/mybots` → бот → Payments → Stars (автоматически)
3. Опционально: `/setmenubutton` → Mini App URL (для кнопки "Играть" нужен https)

```bash
cd apps/bot && cp .env.example .env
# вставить TELEGRAM_BOT_TOKEN и при желании WEB_APP_URL
pnpm --filter @dead-spin/bot dev      # long-polling, подходит для локалки
```

## Текущий статус

**Фазы 0–3 завершены.** Typecheck: 6 пакетов Done. **56 тестов зелёные** (33 engine + 15 api + 8 bot). 15/15 уровней валидны.

| Пакет | Назначение | Тесты |
|---|---|---|
| `@dead-spin/shared` | Zod-схемы (Level, Decoration, Enemy) + константы | — |
| `@dead-spin/engine` | Физика, векторы, chunks, B-spline, fixed-timestep loop | 33 |
| `@dead-spin/db` | Общие Drizzle-таблицы | — |
| `@dead-spin/levels` | 15 JSON + loader с runtime-валидацией | — |
| `@dead-spin/api` | Hono + Drizzle + JWT + Telegram auth + ленивая регенерация fuel | 15 |
| `@dead-spin/bot` | grammY (polling/webhook), меню + магазин + лидерборд + XTR-платежи | 8 |

**Следующая фаза:** Фаза 4 — `apps/game` на Vite + Solid + Pixi.
