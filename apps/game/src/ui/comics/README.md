# Comics

Декларативные катсцены в формате JSON. Один файл = один комикс.
Схема в [`packages/shared/src/comic.ts`](../../../../../packages/shared/src/comic.ts), плеер в [`ComicPlayer.tsx`](../ComicPlayer.tsx).

## Как добавить новый комикс

1. Положить кадры: `apps/game/public/comics/c{N}-1.jpg`, `c{N}-2.jpg`, …
2. Создать `apps/game/src/ui/comics/c{N}.json` (см. формат ниже).
3. В `index.ts` добавить строку в `registry`: `c{N}: validateComic(c{N})`.
4. В нужном `packages/levels/src/data/{n}.json` указать `"intro": "c{N}"` или `"outro": "c{N}"`.

Прелоад картинок и cross-валидация ссылок происходят автоматически.

## Формат

```jsonc
{
  "id": "c1",                    // обязательно, должен совпадать с ключом в registry
  "letterbox": false,            // default true — две чёрные полосы 8% сверху/снизу
  "panels": [
    {
      "img": "/comics/c1-1.jpg", // обязательно
      "duration": 7000,          // мс, default 7000
      "shake": "slow",           // 'none' | 'slow' | 'medium' | 'fast' (игнорируется если задан ken)
      "ken": {                   // Ken Burns: pan + zoom
        "path": ["left", "right", "center"], // якоря (минимум 2), равномерно по времени
        "scale": 1.15,           // 1..2, default 1.15
        "duration": 7000         // мс; если не задано — берётся panel.duration
      },
      "enter": [                 // звуки на входе в панель
        {"sound": "rocket2"},
        {"sound": "ship-alarm", "loop": true, "volume": 0.5, "delay": 2000}
      ],
      "caption": {               // субтитр поверх кадра
        "text": "Связь потеряна.",
        "at": 0,                 // мс от входа в панель, default 0
        "until": 5000,           // мс до скрытия (default — конец панели)
        "typewriter": true,      // default true; false — текст появляется целиком
        "cps": 40                // символов в секунду
      }
    }
  ]
}
```

## Якоря для Ken Burns

`tl` `tr` `bl` `br` — углы; `top` `bottom` `left` `right` — середины сторон; `center` — центр.

Например, `["tl", "br"]` — диагональный наезд из левого верхнего в правый нижний.
`["left", "right", "center"]` — панорама слева направо с возвратом в центр (как в `c1`).

## Звуки

Имена в `sound` — это ключи из `apps/game/src/game/audio.ts:SOUNDS`. Доступные: `rocket1`, `rocket2`, `explosion1..3`, `ship-alarm`, `worm`, `stone-impact`, `booster`, `star-catch`, `low-fuel`.

Loop-cue (`"loop": true`) автоматически гасится при уходе с панели и на skip — никогда не "залипает" в фоне.

## Постановка

- **Шейк** — для статичных трясок (рев двигателя, взрыв). На плеере 60 fps.
- **Ken Burns** — для cinematic-панорам по картинке. CSS-анимация через Web Animations API; ставится на паузу когда вкладка свёрнута.
- **Letterbox** — превращает экран в "катсценный". Включён по умолчанию; отключай если `cN-*.jpg` спроектированы под полный экран.
- **Cross-fade** между панелями — 800мс, общий для всех.
- **Музыка** игры приглушается на время комикса автоматически.

## Гейтинг

- **Intro** — играет один раз при первом старте уровня (`progress.levels[N]` ещё не выставлен).
- **Outro** — играет один раз навсегда (отслеживается через `localStorage`-ключ `comic-outro-seen-{id}`).

Чтобы посмотреть outro заново для теста — `localStorage.removeItem('comic-outro-seen-c2')` в DevTools, потом пройти уровень.
