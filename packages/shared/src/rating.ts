import type {Level} from './level';


/**
 * Рейтинг прохождения — три независимых условия, каждое даёт звезду.
 * Это то, за чем игрок возвращается на пройденный уровень (см. GDD §9):
 *
 *   ★ финиш            — всегда, если дошёл
 *   ★ время            — timeMs ≤ parTimeMs
 *   ★ полная зачистка  — все 3 предмета собраны И fuelSpent ≤ parFuel
 *
 * Условия суммируются: можно взять «время» без «зачистки» и наоборот.
 * Попытка с continue даёт максимум одну звезду — рейтинг только за
 * чистое прохождение (GDD §11).
 *
 * Пороги живут в JSON уровня. Если их нет — уровень считается без par,
 * и вторая/третья звезда недостижимы: это осознанно, чтобы забытый порог
 * был виден сразу, а не давал звёзды бесплатно.
 */


export const DEFAULT_FUEL_TANK = 4000;
/** Ниже этой доли бака включается алярм низкого топлива. */
export const LOW_FUEL_FRACTION = 0.2;
export const STARS_PER_LEVEL = 3;


export type RunOutcome = {
	/** Сколько звёзд-предметов подобрано за заход (0..3). */
	collected: number;
	timeMs: number;
	fuelSpent: number;
	usedContinue?: boolean;
};

export type Rating = {
	/** Итоговое число звёзд 1..3 (0 — если не дошёл; такие заходы сюда не попадают). */
	stars: number;
	parHit: boolean;
	fullClear: boolean;
};


export function levelFuelTank(level: Pick<Level, 'fuelTank'>): number {
	return level.fuelTank ?? DEFAULT_FUEL_TANK;
}


export function computeRating(
	level: Pick<Level, 'parTimeMs' | 'parFuel'>,
	run: RunOutcome,
): Rating {
	if (run.usedContinue) return {stars: 1, parHit: false, fullClear: false};

	const parHit = level.parTimeMs !== undefined && run.timeMs <= level.parTimeMs;
	const fullClear =
		level.parFuel !== undefined &&
		run.collected >= STARS_PER_LEVEL &&
		run.fuelSpent <= level.parFuel;

	return {
		stars: 1 + (parHit ? 1 : 0) + (fullClear ? 1 : 0),
		parHit,
		fullClear,
	};
}


/**
 * Слияние нового результата с сохранённым рекордом. Флаги липкие: раз
 * выполненное условие не отбирается медленным перепрохождением; время и
 * топливо — минимумы. Звёзды выводятся из флагов, а не хранятся отдельно.
 */
export function mergeRecord(
	existing: {parHit: boolean; fullClear: boolean; timeMs: number; fuelSpent: number} | null | undefined,
	next: Rating & {timeMs: number; fuelSpent: number},
): {stars: number; parHit: boolean; fullClear: boolean; timeMs: number; fuelSpent: number} {
	const parHit = (existing?.parHit ?? false) || next.parHit;
	const fullClear = (existing?.fullClear ?? false) || next.fullClear;
	return {
		stars: 1 + (parHit ? 1 : 0) + (fullClear ? 1 : 0),
		parHit,
		fullClear,
		timeMs: existing ? Math.min(existing.timeMs, next.timeMs) : next.timeMs,
		fuelSpent: existing ? Math.min(existing.fuelSpent, next.fuelSpent) : next.fuelSpent,
	};
}
