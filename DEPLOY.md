# Deploy Dead Spin (free tier)

Минимальный путь для тестового деплоя на 100% бесплатных хостингах.

## Архитектура

```
┌────────────────────┐      ┌─────────────────────────────┐      ┌──────────────┐
│ Cloudflare Pages   │◀────▶│ Render.com                  │◀────▶│ Neon.tech    │
│ apps/game (статика)│ HTTPS│ - dead-spin-api  (Web)      │ TLS  │ Postgres 16  │
└────────────────────┘      │ - dead-spin-bot  (Web poll) │      └──────────────┘
                            └─────────────┬───────────────┘
                                          │ long-polling
                                          ▼
                                   ┌────────────┐
                                   │ Telegram   │
                                   └────────────┘
```

Все три платформы — free навсегда. Render free засыпает через 15 минут
без HTTP-запросов (cold start ~30–60 с); для теста ок.

## 0. Подготовка

- GitHub-репо с этим монорепо (push).
- Аккаунты: **Neon.tech**, **Render.com**, **Cloudflare** (или Vercel/Netlify).
- Telegram Bot Token от `@BotFather`.

## 1. Neon — Postgres

1. [neon.tech](https://neon.tech/) → Create project → название `dead-spin`, регион Europe.
2. Скопируй **Connection string** (pooled). Формат:
   `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require`.
3. Отложить — вставим в Render.

## 2. Render — API + Bot

Render читает `render.yaml` из корня репо и разворачивает декларативно.

1. Render Dashboard → **New → Blueprint** → выбрать GitHub-репо с `dead-spin/`.
2. Render найдёт `render.yaml`, покажет два сервиса:
   - `dead-spin-api` (web)
   - `dead-spin-bot` (web, polling)
3. Для каждого попросит заполнить поля `sync: false`:
   - **dead-spin-api**
     - `DATABASE_URL` — строка из Neon
     - `TELEGRAM_BOT_TOKEN` — от BotFather
     - `CORS_ORIGINS` — `https://<твой-проект>.pages.dev`
   - **dead-spin-bot**
     - `WEB_APP_URL` — `https://<твой-проект>.pages.dev`
     - `TELEGRAM_BOT_TOKEN` и `DATABASE_URL` подтянутся из api через `fromService`.
4. `JWT_SECRET` сгенерируется автоматом (`generateValue: true`).
5. **Apply** — Render установит зависимости, прогонит `db:migrate`, запустит сервисы.

После деплоя запиши URL:
- API: `https://dead-spin-api.onrender.com` (или как назовёт Render)
- Bot health: `https://dead-spin-bot.onrender.com/healthz`

## 3. Cloudflare Pages — Frontend

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Выбери репо.
3. Настройки билда:
   - **Root directory**: `dead-spin`
   - **Build command**: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @dead-spin/game build`
   - **Build output directory**: `apps/game/dist`
4. Environment variables (Production):
   - `VITE_API_BASE` = URL API от Render (без `/` в конце)
   - `NODE_VERSION` = `22`
5. Save and Deploy.

Через 1–2 минуты готов URL: `https://<проект>.pages.dev`.

## 4. Telegram Mini App

1. `@BotFather` → `/mybots` → твой бот → **Bot Settings → Menu Button → Configure menu button**
   - URL: `https://<проект>.pages.dev`
   - Button text: `🚀 PLAY`
2. (опционально) `/newapp` для Mini App с preview-картинкой.

## 5. Allowlist

В prod `ALLOWLIST_OPEN=0` (по умолчанию) — пускают только те `tgId`, которые есть в таблице `allowlist`. Для первого теста добавь свой ID вручную:

```bash
# через psql к Neon (из их Dashboard или локально с строкой подключения)
INSERT INTO allowlist (tg_id, note) VALUES ('468311941', 'owner');
```

Либо временно переключи на `ALLOWLIST_OPEN=1` в Render env и перезапусти.

## 6. Проверка

- Открой `https://dead-spin-api.onrender.com/healthz` → `{"ok":true,"env":"production"}`
- Открой бота в Telegram → `/start` → должен ответить
- Нажми кнопку меню → откроется Mini App → залогинит автоматически

## Частые проблемы

| Симптом | Причина / фикс |
|---|---|
| API отвечает 502 первый запрос | Render free cold start, подожди 30–60 с |
| Вход в Mini App → `notAllowed` | Твоего tgId нет в `allowlist` (см. §5) |
| Вход → `signature` | `TELEGRAM_BOT_TOKEN` в Render не совпадает с BotFather |
| Вход → `initDataString` / `initData.*` | Приложение открыто не через Telegram. Это ок для Mini App, но не тестируется из браузера (там нет initData) |
| CORS error в консоли | `CORS_ORIGINS` не содержит домен Pages |
| Миграция не запустилась | Проверь preDeployCommand в Render Dashboard → Logs. Скорее всего DATABASE_URL некорректен |
| Bot не принимает обновления | Проверь `/healthz` бота — живой ли; логи Render на бот-сервисе должны содержать `Polling updates from Telegram…` |

## Обновление

- Push в main → Render и Cloudflare Pages автоматически пересобирают.
- Render стартует миграции на каждый деплой (idempotent).

## Платные улучшения (если пойдёт)

- Render Starter $7/мес на API — уберёт cold start
- Neon Pro $19/мес — больше БД
- Cloudflare Pages остаётся free
- Custom domain через Cloudflare (тоже free)
