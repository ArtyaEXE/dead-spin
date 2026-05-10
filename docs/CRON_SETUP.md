# Внешний cron — пошаговая настройка

API имеет два cron-эндпоинта, которые **никто не дёргает по умолчанию**.
Без внешнего планировщика weekly-digest и full-fuel-push не работают.

| Endpoint | Что делает | Частота |
|---|---|---|
| `POST /cron/weekly-digest` | сводка недели в каждый зарегистрированный групп-чат | раз в неделю |
| `POST /cron/full-fuel-push` | DM-нотификация юзерам с полным баком, idle ≥ 12 ч | каждые 30–60 мин |

Идемпотентность встроена в логику — лишние срабатывания безопасны, ничего не задублируется.

---

## Что нужно подготовить

### 1. CRON_SECRET

Уже сгенерирован Render'ом автоматически (`generateValue: true` в `render.yaml`). Чтобы посмотреть значение:

1. Зайди на [Render Dashboard](https://dashboard.render.com)
2. Открой service `dead-spin-api`
3. Вкладка **Environment** → найди `CRON_SECRET`, нажми «глаз» → скопируй

### 2. Базовый URL API

URL твоего API в Render: что-то вроде `https://dead-spin-api.onrender.com`.
Подставь его ниже вместо `https://YOUR_API`.

---

## Регистрация на cron-job.org (5 минут)

[cron-job.org](https://cron-job.org) — бесплатный, не требует репо или сервера, поддерживает custom headers (нам нужно для `X-Cron-Secret`).

1. Зарегистрируйся (можно через GitHub-OAuth).
2. **Cronjobs** → **Create cronjob**.

### Job 1: weekly-digest

| Поле | Значение |
|---|---|
| Title | `dead-spin weekly-digest` |
| URL | `https://YOUR_API/cron/weekly-digest` |
| Schedule | Every week → пн 09:00 UTC (или любой день/время на твой вкус) |
| Method | POST |
| Custom request headers | `X-Cron-Secret: <значение из Render>` |
| Treat status code as success | `200` |

**Save**.

### Job 2: full-fuel-push

| Поле | Значение |
|---|---|
| Title | `dead-spin full-fuel-push` |
| URL | `https://YOUR_API/cron/full-fuel-push` |
| Schedule | Every 30 minutes |
| Method | POST |
| Custom request headers | `X-Cron-Secret: <значение из Render>` |
| Treat status code as success | `200` |

**Save**.

### 3. Проверка

В cron-job.org открой каждый job → **History**. После первого срабатывания должен быть статус `200 OK` и body вроде `{"ok":true,"sent":N,"skipped":M}`.

Если 403 — проверь, что header `X-Cron-Secret` точно совпадает с `CRON_SECRET` в Render (пробелы, лишние символы).
Если 404 (`cronDisabled`) — `CRON_SECRET` пуст в env.

---

## Альтернатива: GitHub Actions (если не хочется регистрировать стороннее)

Создай `.github/workflows/cron.yml`:

```yaml
name: cron

on:
  schedule:
    - cron: '0 9 * * 1'    # weekly-digest: каждый пн 09:00 UTC
    - cron: '*/30 * * * *' # full-fuel-push: каждые 30 минут
  workflow_dispatch:        # можно дёрнуть руками из UI

jobs:
  weekly-digest:
    if: github.event.schedule == '0 9 * * 1' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST 'https://YOUR_API/cron/weekly-digest' \
               -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}"

  full-fuel-push:
    if: github.event.schedule == '*/30 * * * *'
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST 'https://YOUR_API/cron/full-fuel-push' \
               -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}"
```

Положи `CRON_SECRET` в Settings → Secrets and variables → Actions → New repository secret.

**Caveat:** GitHub Actions на schedule имеет лаг 5–15 минут (а иногда и больше). Для weekly-digest норм, для 30-минутного push — может быть ~45-минутный фактический интервал. Если это критично — выбирай cron-job.org.

---

## Проверка из CLI

Можно дёрнуть вручную, чтобы убедиться, что endpoint жив:

```bash
curl -X POST https://YOUR_API/cron/weekly-digest \
     -H "X-Cron-Secret: <значение>"
```

Ожидаемый ответ: `{"ok":true,"sent":N,"skipped":M}`.
