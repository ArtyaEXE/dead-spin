import {FUEL_MAX, FUEL_REGEN_PER_TICK, FUEL_TICK_MS} from '@dead-spin/shared';


/**
 * Ленивая регенерация fuel (чистая функция, без БД).
 *
 * В старой системе фоновый воркер каждые 10 сек писал в БД +500 fuel
 * каждому юзеру. Для сотен юзеров это лишняя запись и отдельная
 * машина состояния. Тут мы считаем накопленное при каждом чтении/записи:
 *
 *   elapsed = now - fuel_updated_at
 *   ticks   = floor(elapsed / TICK_MS)
 *   fuel   := min(FUEL_MAX, fuel + ticks * REGEN)
 *   fuel_updated_at += ticks * TICK_MS
 *
 * Остаток `elapsed % TICK_MS` сохраняется в метке, чтобы дробные тики
 * не терялись между вызовами.
 */
export function computeRegenerated(
	currentFuel: number,
	fuelUpdatedAtMs: number,
	nowMs: number,
): {fuel: number; fuelUpdatedAtMs: number} {
	if (currentFuel >= FUEL_MAX) {
		// Уже на потолке или сверх (от внешних источников — daily, Stars,
		// реферал). Регенерация дальше не идёт, но и НЕ срезаем — иначе
		// съели бы over-cap бонус. Возвращаем как есть.
		return {fuel: currentFuel, fuelUpdatedAtMs: nowMs};
	}

	const elapsed = nowMs - fuelUpdatedAtMs;
	if (elapsed < FUEL_TICK_MS) {
		return {fuel: currentFuel, fuelUpdatedAtMs};
	}

	const ticks = Math.floor(elapsed / FUEL_TICK_MS);
	const newFuel = Math.min(FUEL_MAX, currentFuel + ticks * FUEL_REGEN_PER_TICK);
	const newStamp = fuelUpdatedAtMs + ticks * FUEL_TICK_MS;

	return {fuel: newFuel, fuelUpdatedAtMs: newStamp};
}
