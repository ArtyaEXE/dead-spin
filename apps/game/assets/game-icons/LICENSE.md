# game-icons.net

Файлы в этой папке — исходники иконок с https://game-icons.net, вендорены
в репозиторий, чтобы сборка была воспроизводимой и не ходила в сеть.

Из них `apps/game/scripts/gen-icons.mjs` собирает иконки игры: силуэт
перекрашивается в палитру проекта по роли (латунь — прибор, золото —
награда, оранжевый — угроза). Геометрия не меняется.

## Лицензия

Creative Commons Attribution 3.0 Unported (CC BY 3.0).
https://creativecommons.org/licenses/by/3.0/

Условие: указание авторства. Оно выполнено в экране настроек игры
(`apps/game/src/ui/Settings.tsx`) и продублировано здесь.

## Авторы использованных иконок

| Автор | Иконки |
|---|---|
| **Delapouite** | jerrycan, musical-notes, sound-on, trophy-cup, present, finish-line, star-medal, ribbon-medal, sport-medal, medallist, speedometer, level-end-flag |
| **Lorc** | stopwatch, gears, padlock, ghost, pointing, hazard-sign, bright-explosion, medal, afterburn, interdiction, falling-boulder |
| **Skoll** | teller-mine |
| **Cathelineau** | earth-worm |
| **guard13007** | pause-button |
| **Viscious Speed и участники набора badges** | coins, star, arrow-down |

Неиспользуемые исходники в папке остаются намеренно: они были отобраны и
отвергнуты по разным причинам (текст внутри иконки, двусмысленность на мелком
размере), и держать их рядом дешевле, чем искать заново.

Полный список авторов и оригиналы: https://game-icons.net/about.html
