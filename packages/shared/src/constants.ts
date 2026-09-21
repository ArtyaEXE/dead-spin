export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Количество ВАЛИДНЫХ уровней — то есть тех, для которых есть JSON в
 * `packages/levels/src/data/`. Отличается от наибольшего номера уровня:
 * сейчас CERES (1..15) + PALLAS (16..30) = 30 валидных. UI использует
 * это значение для счётчиков "X / N".
 *
 * При добавлении нового мира поднимаем здесь — иначе `Levels`-экран
 * не покажет ачиев "all levels", а ачивка `all_levels` не выдастся.
 */
export const LEVEL_COUNT = 30;
export const MAX_LEVEL_NUMBER = 1000;

export const PLAYER_RADIUS = 30;
export const STAR_RADIUS = 20;
export const FINISH_RADIUS = 25;
/** Максимальная скорость в момент касания финиша. Выше — пролёт мимо. */
export const FINISH_MAX_SPEED = 80;
export const FUEL_CONSUMPTION_PER_BOOST = 100;
export const BOOST_FORCE = 50;

export const MIN_LEVEL_TIME_MS = 3 * SECOND;
export const MAX_LEVEL_TIME_MS = HOUR;

export const FUEL_SPEND_MIN = 20;
export const FUEL_SPEND_MAX = 20_000;
export const FUEL_MAX = 30_000;
export const FUEL_REGEN_PER_TICK = 500;
export const FUEL_TICK_MS = 10 * SECOND;
export const FUEL_INITIAL = 10_000;

export const STARS_MIN = 0;
export const STARS_MAX = 3;
