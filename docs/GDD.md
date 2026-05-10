# Dead Spin — Game Design Document

Версия документа: v1.0 · 2026-05-10
Стадия проекта: pre-alpha (закрытое тестирование 5–10 игроков)

---

## 1. High Concept

**Dead Spin** — социальная физическая аркада в Telegram Mini App. Игрок ведёт постоянно вращающуюся ракету через тесные пещеры астероидов, собирает звёзды, уворачивается от мин, камней и червей и стремится в финиш с минимальным временем и максимумом звёзд.

**Логлайн:** «Ракета вращается сама — ты решаешь, *когда* дать тягу. Один промах — взрыв».

**Hook одной строкой:** не «ещё одна аркада в TG», а **аркада, которая живёт в твоём групповом чате**: pinned-лидерборд, ghost-replays соседа по беседе и `/challenge`-дуэли.

**USP / отличие от конкурентов:**
1. Pinned-лидерборд **per-chat** — каждая беседа со своим топом и ghost'ами лидера.
2. `/challenge @user N` — single-attempt дуэль 1v1 с asynchronous-резолвом.
3. Ghost replays через event-based recording (~1 КБ / прохождение) — призрак реально воспроизводится в твоём раунде.
4. Игра доступна там, где уже есть друзья (Telegram-чаты), а не «приведи друзей в новый клиент».

---

## 2. Целевая аудитория

| Сегмент | Описание | Что цепляет |
|---|---|---|
| **Core** | 18–35, мобильные казуальщики, активные TG-пользователи в групповых чатах | соревнование с друзьями, короткие сессии (30–90 сек на уровень) |
| **Secondary** | олдскулы Meteor-эпохи, фанаты Lunar Lander / Asteroids / Cave Hopper | физика, узкие коридоры, «ещё один попытку» |
| **Whales (потенциал)** | соревнующиеся в активных чатах | покупка Stars-fuel, чтобы не терять стрик дуэлей |

**Почему сейчас:** Telegram Stars + Mini Apps дают полноценный рантайм с платежами и identity без app-store фрикции; групповые чаты — недопиленный distribution-канал.

---

## 3. Core Gameplay Loop

### 3.1 Микро-петля (один уровень, 30–90 сек)

```
spawn → корабль вращается с постоянной vr=360°/сек
     ↓
тап / клик → ускорение по нос-вектору (boost = 50 ед., -100 fuel)
     ↓
лавируешь между стенами (ballistic + gravity), собираешь до 3⭐
     ↓
финиш-круг радиусом 15px, скорость должна быть < 40 → win
   |
столкновение с врагом или стеной → loose → restart
```

### 3.2 Мезо-петля (сессия, 5–15 мин)

```
открыл Mini App → daily check-in (если доступен) → выбор уровня
     ↓
играю несколько уровней → fuel падает → fuel ≤ 2000 = LOW_FUEL alarm UI
     ↓
fuel = 0 → варианты: ждать regen, потратить coins, купить Stars-pack, выйти
```

### 3.3 Макро-петля (retention, дни-недели)

```
push «бак полон» (24h cooldown) → возвращаюсь
     ↓
daily check-in: 7-day rotating reward (fuel/coins) → стрик → не пропускать
     ↓
group chat: pinned LB обновился, кто-то побил мой рекорд → играю реванш
     ↓
weekly digest в группе → виден рост / падение → социальное давление
     ↓
ghost replay лидера группы → пытаюсь побить → апаю скин по звёздам
```

---

## 4. Controls & Feel

| Действие | Управление | Эффект |
|---|---|---|
| Boost | tap / click hold | импульс +50 ед. вдоль текущего угла, -100 fuel |
| Rotate | **автоматически** vr = 360°/сек | игрок не управляет вращением — это и есть ядро механики |
| Pause | кнопка на HUD | замораживает физику и таймер |
| Zoom | UI (0.6×–1.4×) | сохраняется в `localStorage['dead-spin.sceneZoom']` |

**Ключевой ощущенческий конфликт:** ты не можешь «целиться» — ты можешь только *выбрать момент*. Это даёт кривую обучения «легко начать — глубоко мастерить».

Camera: follow + 7% parallax на заднем слое пещеры (`apps/game/src/game/GameWorld.ts:625-628`), tilingsprite `light.png` поверх для атмосферы.

---

## 5. Физика и движок

Чистая TS-реализация в `packages/engine/`:

- **Fixed-timestep loop** (`engine/src/loop.ts`) — детерминированный шаг для replay/ghost.
- **Vector math** (`engine/src/vector.ts`).
- **Collision** (`engine/src/physics.ts:96`): circle-vs-polyline sweep, `steps = ceil((speed * dt / radius) * 2)` подшагов — без туннелирования на больших скоростях.
- **Stone-vs-stone:** упругий обмен нормальными компонентами скорости (`GameWorld.ts:446-453`).
- **Apply force:** `(sin(r), -cos(r)) * force` — 0° = вверх (`physics.ts:28-32`).

**Тесты:** 33 unit-теста в engine — гарантия детерминизма для ghost-replays.

**Константы баланса** (`packages/shared/src/constants.ts`):

| Параметр | Значение |
|---|---|
| PLAYER_RADIUS | 30 |
| STAR_RADIUS | 20 |
| FINISH_RADIUS | 15 (требуется speed < 40) |
| BOOST_FORCE | 50 |
| FUEL_CONSUMPTION_PER_BOOST | 100 |
| MIN_LEVEL_TIME_MS | 3000 (anti-cheat нижняя граница) |
| MAX_LEVEL_TIME_MS | 3 600 000 (1 ч) |

---

## 6. Сущности

### 6.1 Игрок (ракета)
- Hitbox: круг 30px.
- Физика: ballistic + global gravity vector уровня.
- Спрайт: один из 5 скинов (см. §10).

### 6.2 Звёзды (сбор)
- Ровно 3 на уровень (`star1`, `star2`, `star3` в JSON).
- Hitbox 20px. При сборе: invisible + SFX `star-catch`.
- Сумма звёзд за уровень = 0…3, копится в global `summaryStars` (для скинов).

### 6.3 Финиш
- Hole-спрайт + триггер-круг 15px + ограничение скорости < 40.
- При входе: 800ms анимация финиша, отправка `/progress/level-complete`.

### 6.4 Враги (3 типа)

| Тип | Поведение | Hitbox | Заметки |
|---|---|---|---|
| **Stone** (камень) | прямолинейное движение со скоростью `speed`, упругий отскок от стен и других камней | круг `radius` (обычно 40) | вращается с vr ∈ [−90, 90]°/с, дымы появляются при дистанции < 500px, SFX по дистанции |
| **Mine** (мина) | статична, синусоидальное покачивание ±5px / 3с | круг `radius` (обычно 30) | при попадании — explosion-эффект |
| **Worm** (червяк) | 5 сегментов идут по замкнутому B-сплайну (детерминирован из `seed`) | каждый сегмент 35px | speed=100, спавн-сдвиг по сплайну выбирается дальше всего от игрока (anti-spawn-camp) |

Schema: `packages/shared/src/level.ts:45-75` (Zod discriminated union).

### 6.5 Декорации (3 типа)
- `static` — спрайт (debris, ship, stuff) с трансформом x/y/r/s; **могут вмуровываться в стены** для эффекта «вмёрзшего обломка» (см. feedback level-design).
- `gravity` — стрелка-индикатор направления гравитации (визуал; механика гравитации глобальная по уровню).
- `stop` — точка-маркер (визуальный hint для дизайна).

---

## 7. Контент: уровни и миры

### 7.1 Структура

| Параметр | Значение |
|---|---|
| Уровней всего (alpha) | **15** (`LEVEL_COUNT = 15`) |
| Миров | 5 × 3 уровня (`apps/game/src/game/worlds.ts`) |
| Формат | JSON, валидация Zod (`pnpm validate:levels`) |

**Поля уровня:** `name`, `res {x,y}`, `startPoint`, `finishPoint`, `star1..3`, `gravity {x,y}`, `walls[][]`, `decorations[]`, `enemies[]`, `intro?`, `outro?`, `referenceUrl`.

### 7.2 Миры (тематика — астероиды главного пояса)

| Мир | Уровни | Тематика | Статус |
|---|---|---|---|
| **CERES** | #1–#3 | вход, learning by doing | ✅ запольнен |
| **PALLAS** | #4–#6 | первая гравитация, первые враги | ⚠️ пусто (placeholder) |
| **JUNO** | #7–#9 | мины, узкие коридоры | ⚠️ пусто |
| **VESTA** | #10–#12 | камни, открытые пространства | ⚠️ пусто |
| **EUNOMIA** | #13–#15 | черви + комбо-сложность | ⚠️ пусто |

> **Главный bottleneck retention:** 4 из 5 миров пустые. Решение — `dead-spin-level-generator` skill для процедурной/полу-ручной заполки.

### 7.3 Кривая сложности (по факту)

- **#1 CERES:** 0 врагов, gravity = (0, 0), карта 1100×1000 → обучение управлению.
- **#15 EUNOMIA:** 1 worm + 1 stone + 3 mines, gravity = (8, 5), карта 2300×1900 → стресс-тест механик.

### 7.4 Level Design правила (закреплено в feedback memory)
- Пещеры **органичные**, не прямоугольные («fossilized cave», не «комната»).
- Корабельные обломки могут *вмуровываться* в стену — намёк на лор «кто-то здесь уже разбился».

---

## 8. Нарратив

### 8.1 Тон
Минималистичный, сай-фай, без диалогов. Атмосфера ставится звуком и кадром, не текстом.

### 8.2 Intro Comic `c1` (`apps/game/src/ui/comics/c1.json`)
Без caption'ов, 3 панели по 9 сек, Ken Burns left→right→center, scale 1.1:

| Кадр | Asset | Sound | Смысл |
|---|---|---|---|
| 1 | `c1-1.jpg` | `rocket2` | ракета летит штатно |
| 2 | `c1-2.jpg` | `explosion1` + `ship-alarm` (loop, delay 2s) | удар, сигнал тревоги |
| 3 | `c1-3.jpg` | `ship-alarm` (loop, тише) | дрейф в пещерах астероида |

→ Игрок начинает уровень 1 как «выживший пилот», без лекции.

### 8.3 Расширение нарратива (в backlog)
- Outro комикс по завершении мира.
- Per-world intro для PALLAS/JUNO/VESTA/EUNOMIA.

---

## 9. Прогрессия и экономика

### 9.1 Fuel (ресурс действия)

| Параметр | Значение |
|---|---|
| FUEL_INITIAL | 10 000 |
| FUEL_MAX | 30 000 |
| FUEL_CONSUMPTION_PER_BOOST | 100 |
| FUEL_REGEN_PER_TICK | 500 / 10 сек ≈ 3000/мин |
| LOW_FUEL_THRESHOLD (UI alarm) | 2 000 |

**Регенерация:** lazy — считается на каждом read'е БД через `computeRegenerated()` (`apps/api/src/lib/fuel.ts`), без фоновых воркеров. Полный бак с нуля ≈ 100 минут.

### 9.2 Coins (мягкая валюта)

| Источник | Сумма |
|---|---|
| Daily check-in день 3 | 25 |
| Daily check-in день 5 | 50 |
| Daily check-in день 7+ (recurring) | 100 |
| Реферал-бонус пригласившему | 200 |
| Покупка `coins_pack` | 100 за 50 XTR |

**Расход:** на момент v1 — `coins-skip-fuel` use-case (купить попытку без ожидания регена). Коинная экономика остаётся **минимальной до конца alpha** — backlog-айтем.

### 9.3 Скины ракеты (`apps/game/src/stores/skin.ts`)

| ID | Имя | Условие |
|---|---|---|
| `prospector` | PROSPECTOR | 0⭐ (default) |
| `wanderer` | WANDERER | 8⭐ |
| `engineer` | ENGINEER | 20⭐ |
| `veteran` | VETERAN | 35⭐ |
| `asteroid-king` | ASTEROID KING | 45⭐ (= все 15×3⭐) |

**Контекст:** в DM скин гейтится глобальной суммой звёзд; в группе — суммой звёзд **в этой беседе**, чтобы не показывать ASTEROID KING с 0⭐ в новом чате (`stores/skin.ts:58-59`).

### 9.4 Achievements (10 шт, `apps/api/src/lib/achievements.ts`)

| ID | Иконка | Условие |
|---|---|---|
| first_clear | 🚀 | первая победа |
| first_3stars | ⭐ | первое 3⭐ |
| all_levels | 🏁 | пройти все 15 уровней |
| all_3stars | 🏆 | 3⭐ на всех 15 |
| speedrunner | ⚡ | уровень < 10 сек |
| fuel_efficient | 💨 | ≤ 300 fuel + ≥ 1⭐ |
| all_skins | 👨‍🚀 | все 5 скинов |
| week_streak | 🔥 | групповой стрик ≥ 7 |
| first_duel_win | 👊 | первая победа в /challenge |
| bot_in_group | 👥 | использовать бота в группе |

INSERT с `onConflictDoNothing` — атомарная разблокировка, нотификация в DM с emoji-реакцией.

### 9.5 Daily Check-in (`apps/api/src/lib/daily-rewards.ts`)

| День стрика | Награда |
|---|---|
| 1 | 500 fuel |
| 2 | 1 000 fuel |
| 3 | 25 coins |
| 4 | 2 000 fuel |
| 5 | 50 coins |
| 6 | 3 000 fuel |
| 7+ | 100 coins (повторяется ежедневно) |

Стрик считается по UTC-дате, пропуск дня → reset = 1.

### 9.6 Referral

- Deep-link: `t.me/<bot>?start=ref_<tgId>`.
- Новичку: **+1 000 fuel**. Пригласившему: **+200 coins**.
- Защита: новый юзер без `referrer_id`, реферер существует, не сам себя.

---

## 10. Монетизация

Магазин — `apps/api` LOTS (`lots.ts:23-48`), оплата через Telegram Stars (XTR), webhook → idempotent INSERT по `tg_charge_id`.

| Лот | Цена | Содержимое |
|---|---|---|
| `fuel_small` | 10 ⭐ | 5 000 fuel |
| `fuel_big` | 25 ⭐ | 15 000 fuel |
| `coins_pack` | 50 ⭐ | 100 coins |

**Принципы:**
- **Никакого pay-to-win по геймплею**: скины бесплатно по звёздам, нет «buy 3 stars», нет «skip level».
- Stars покупают **только время** (fuel) — игрок может то же самое получить ожиданием.
- Идемпотентность платежей (уникальный индекс по `tg_charge_id`).

---

## 11. Социальные фичи (USP)

### 11.1 Per-chat Leaderboard
- Таблица `group_progress_levels (chat_id, user_id, level, stars, time_ms)`.
- Сортировка: stars DESC → time_ms ASC.
- Доступно через `/lb [level]` или endpoint `GET /progress/group/:chatId?hmac=<12hex>`.
- HMAC по chat-context — защита от подделки.

### 11.2 Pinned LB
- Бот пинит сообщение со сводкой топа в группе, обновляет через `editMessageText`.
- `pinnedMessageId` в `groupChats` table.

### 11.3 `/challenge @user N` (1v1 дуэли)
- **Single-attempt:** первое прохождение игроком после вызова = его финальный результат.
- Сравнение: ⭐ DESC → ⏱ ASC.
- Timeout: **7 дней** (`DUEL_CLEANUP_MS`).
- Резолв: edit исходного сообщения + 🏆 reaction.

### 11.4 Ghost Replays (порт Tries.js)
- **Event-based recording:** start/boost/loose/win + `(t, x, y, r, vx, vy, vr)` на каждом событии.
- Между событиями — детерминированный ballistic + gravity.
- Размер: 10–30 событий ≈ **1 КБ / replay** (vs покадровая запись ≈ 100×).
- Валидация плейл-ности (`isPlausibleRecording`): монотонность времени, близость к start/finish (80px / 500ms).
- Ghost рисуется полупрозрачным спрайтом во время твоего раунда.

### 11.5 Group Streaks
- День, когда игрок в этом чате что-то закрыл = +1.
- Milestones: 3, 7, 14, 30, 60, 100 дней — нотификация **один раз** на milestone (`last_notified_milestone`).
- Пропуск дня → streak = 1, milestone-counter обнуляется.

### 11.6 Weekly Digest (cron)
- `POST /cron/weekly-digest`, idempotent (≥6 дней между digest'ами на чат).
- Содержание: пройдено уровней / уникальных игроков / лидер недели / top-3 рекорда.
- Отправка + 📊 reaction.

### 11.7 Identity-контекст
- **DM** = глобальный прогресс, глобальные звёзды для скинов.
- **Group** = локальный per-chat прогресс и звёзды.
- Это сделано осознанно: игрок не должен вламываться в свежую беседу с фул-прогрессом — нужно «заработать репутацию» в новом чате.

### 11.8 Inline Mode
- `@<bot> ...` в любом чате → 3 article-результата с топ-уровнями игрока + ref-payload.
- Органический шеринг рекордов.

### 11.9 Команды бота (`apps/bot/src/handlers/`)
`/start [ref_<id>]`, `/menu`, `/help`, `/shop`, `/me`, `/lb [N]`, `/best`, `/challenge`, `/play`, `/setname`, `/stats`, `/reset`, `/feedback <text>`.

UI: HTML-форматирование, emoji-иерархия, inline-keyboards с editMessageText (одно сообщение, не флудит), expandable-blockquotes для FAQ, прогресс-бар топлива `█████░░░░░`, подсветка своего ника в LB.

---

## 12. Onboarding Flow

```
/start (DM) → проверка username → allowlist check → создать user в БД
        ↓
    разобрать ?start=ref_<tgId> → если валидно: +1000 fuel + DM пригласившему
        ↓
    welcome-сообщение (HTML, эмодзи) → кнопка «Играть» (Mini App)
        ↓
    Mini App → LoginScreen → POST /auth/telegram (initData) → JWT 7d
        ↓
    intro c1 (3 панели × 9с со звуком) → уровень 1 CERES (без врагов, gravity=0)
```

**Time-to-first-fun (TTFF):** ≈ 30 сек от `/start` до первого тапа на boost.

---

## 13. Retention Hooks

| Хук | Канал | Триггер | Cooldown |
|---|---|---|---|
| Daily check-in | Mini App | первый вход за UTC-день | 24h |
| Full-fuel push | Telegram DM | fuel == FUEL_MAX, idle ≥ 12h, active < 30 дней | 24h |
| Group streak milestone | Бот в группе | пересечение 3/7/14/30/60/100 дней | один раз на milestone |
| Record notification | Бот в группе | новый рекорд на уровне в чате | по событию |
| Weekly digest | Бот в группе | cron, ≥ 6 дней с прошлого | weekly |
| Achievement overlay | Mini App + DM-реакция | условие достигнуто | один раз |

**Fuel-push батчинг:** 25 юзеров / 1.1 сек (соблюдение Telegram 30 msg/sec rate limit).

---

## 14. Технический стек

| Слой | Технология |
|---|---|
| Mini App | Vite + Solid.js + Pixi.js v8 (TypeScript) |
| API | Hono + Drizzle ORM + PostgreSQL (Neon) |
| Bot | grammY (Node 22, webhook) |
| Editor уровней | Vite + Solid + Konva |
| Engine (shared) | Pure TS, fixed-timestep, vectors, B-spline, sweep-collision |
| Validation | Zod (общая для клиента и сервера) |
| Tests | Vitest (unit) + Playwright (e2e) |
| Package manager | pnpm workspaces |

**Тесты:** 56 зелёных (33 engine + 15 api + 8 bot). Все 15 уровней проходят Zod-валидацию.

### 14.1 Deploy
- **Mini App:** Cloudflare Pages.
- **API:** Render (Node.js, free-tier — спит после 15 мин idle).
- **Bot:** Render (webhook).
- **DB:** Neon PostgreSQL (managed).
- **Keep-alive:** UptimeRobot пингует `/healthz` каждые 5 мин.
- **Migrations:** автоматом на старте (`db:migrate && start:prod`).

### 14.2 Observability
- **Sentry** — error tracking (env-driven, `VITE_SENTRY_DSN` / `SENTRY_DSN`).
- **PostHog** — product analytics (env-driven, `VITE_POSTHOG_KEY`).

### 14.3 Cron endpoints (требуют внешнего scheduler'а)
- `POST /cron/weekly-digest` — 1× в неделю.
- `POST /cron/full-fuel-push` — каждые 30–60 мин.
- ⚠️ **Внешний cron не настроен** — endpoint'ы есть, никто не дёргает.

### 14.4 API endpoints (Phase 2)
| Метод | Путь | Назначение |
|---|---|---|
| POST | `/auth/telegram` | initData → JWT (7d) |
| GET | `/healthz` | health check |
| GET | `/me` | юзер с пересчитанным fuel |
| GET | `/progress` | summary + рекорды |
| POST | `/progress/level-complete` | отметить прохождение |
| POST | `/fuel/spend` | списать топливо |
| GET | `/leaderboard/:level` | топ + ранг текущего |

### 14.5 Известные риски
- **Race condition в `processGroupResult`:** group-write должен awaited завершиться до возврата 200; side-effects (нотификации, ghosts, streaks, achievements, pinned LB) идут fire-and-forget после (см. коммит `00dad93`).
- **Render free-tier sleep** — mitigated UptimeRobot'ом, но cold-start всё равно есть.

---

## 15. Что зашипано к 2026-05-10

✅ Single-player loop: 15 уровней (только CERES запольнен), скины, fuel, intro `c1`.
✅ Group features: per-chat LB, `/challenge`, ghost replays, pinned LB, weekly digest cron, `/me /lb /best`, реакции на рекорды, welcome.
✅ Alpha-prep: версия в Settings (`__APP_VERSION__` из git sha), retry-UX в LoginScreen, `/reset`, privacy.html, `/feedback`, Sentry hooks, allowlist helper, SMOKE_TEST.md.
✅ Retention pack: PostHog telemetry, daily check-in, full-fuel push cron, 10 achievements + UI overlay, coins-skip-fuel, реферал, inline mode.

---

## 16. Roadmap (post-alpha)

| Приоритет | Задача | Зачем |
|---|---|---|
| **P0** | Заполнить миры PALLAS/JUNO/VESTA/EUNOMIA (12 уровней) | главный bottleneck retention |
| **P0** | Поднять внешний cron на `/cron/*` endpoint'ы | digest и push сейчас не работают |
| **P1** | Полная coins-economy (расход на скрап / косметику) | coins пока почти бесцельны |
| **P1** | Hard mode / Time Trial mode | контент-мультипликатор для core'а |
| **P2** | Per-world outro/intro комиксы | усилить нарратив |
| **P2** | Standalone-режим (без Telegram-auth) → APK + RuStore | каналы дистрибуции вне TG |
| **P3** | Tournament-режим в больших группах | следующий слой социалки |

---

## 17. Open Questions

1. **Coins-расход:** механика «скрап-апгрейды ракеты» vs «магазин косметики» vs «лотерея»? Каждая гипотеза влияет на drop-rate коинов.
2. **Worlds-генерация:** ручная курация vs `dead-spin-level-generator` skill vs гибрид? Скиллом быстрее, но качество выше при ручной полировке.
3. **Public release:** через t.me/dead_spin_new_bot напрямую vs WL → волна? WL даёт качество фидбека, прямой запуск — больше данных.
4. **Tournament economics:** entry-fee в Stars / pool из Stars / просто bragging rights? Влияет на регуляторику Telegram.

---

## Appendix A — Ключевые файлы для разработчика

| Что | Где |
|---|---|
| Главный gameplay-цикл | `apps/game/src/game/GameWorld.ts` |
| Физика | `packages/engine/src/physics.ts` |
| Враги | `apps/game/src/game/enemies/{stone,mine,worm}.ts` |
| Камера | `apps/game/src/game/camera.ts` |
| Ghost recorder/player | `apps/game/src/game/{recorder,ghost-player}.ts` |
| Уровни (JSON) | `packages/levels/src/data/{1..15}.json` |
| Schema уровня | `packages/shared/src/level.ts` |
| Константы баланса | `packages/shared/src/constants.ts` |
| Скины | `apps/game/src/stores/skin.ts` |
| Achievements | `apps/api/src/lib/achievements.ts` |
| Daily rewards | `apps/api/src/lib/daily-rewards.ts` |
| Group features | `apps/api/src/lib/group-*.ts` |
| Bot handlers | `apps/bot/src/handlers/*.ts` |
| Магазин | `apps/api/src/lib/lots.ts`, `apps/bot/src/handlers/shop.ts` |
| Comic player | `apps/game/src/ui/ComicPlayer.tsx`, `comics/c1.json` |

---

*Документ сгенерирован на основе исследования кодовой базы. При расхождении с кодом — код первичен.*
