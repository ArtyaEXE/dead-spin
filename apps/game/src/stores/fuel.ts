import {createMemo, createSignal, onCleanup} from 'solid-js';
import {FUEL_MAX, FUEL_REGEN_PER_TICK, FUEL_TICK_MS} from '@dead-spin/shared';
import {authStore, useAuth} from './auth';


/**
 * Локальный мостик к ленивой fuel-регенерации сервера.
 * Сервер не пушит fuel в реальном времени — он считает регенерацию только
 * при authed-запросе. Между запросами клиент сам считает то же самое
 * (`computeRegenerated` 1:1 с api/lib/fuel.ts), чтобы цифра в TopBar /
 * MainMenu не казалась замороженной.
 *
 * Точка истины — `authStore.user.fuel + fuelUpdatedAt`. При апдейте от
 * сервера (логин, level-complete, fuel-spend) baseline сбрасывается.
 */


function computeRegenerated(currentFuel: number, fuelUpdatedAtMs: number, nowMs: number): number {
	if (currentFuel >= FUEL_MAX) return FUEL_MAX;
	const elapsed = nowMs - fuelUpdatedAtMs;
	if (elapsed < FUEL_TICK_MS) return currentFuel;
	const ticks = Math.floor(elapsed / FUEL_TICK_MS);
	return Math.min(FUEL_MAX, currentFuel + ticks * FUEL_REGEN_PER_TICK);
}


/** Solid-хук: возвращает live-сигнал текущего fuel'а с локальной регенерацией. */
export function useLiveFuel(): () => number {
	const auth = useAuth();
	const [tick, setTick] = createSignal(Date.now());

	const id = window.setInterval(() => setTick(Date.now()), 1000);
	onCleanup(() => window.clearInterval(id));

	return createMemo(() => {
		const u = auth().user;
		if (!u) return 0;
		const baseStamp = new Date(u.fuelUpdatedAt).getTime();
		return computeRegenerated(u.fuel, baseStamp, tick());
	});
}


/** Не-Solid версия: для использования в одноразовых проверках (например, в обработчиках). */
export function getLiveFuel(): number {
	const u = authStore.getState().user;
	if (!u) return 0;
	return computeRegenerated(u.fuel, new Date(u.fuelUpdatedAt).getTime(), Date.now());
}
