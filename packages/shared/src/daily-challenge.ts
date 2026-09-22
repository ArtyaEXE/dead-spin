import {z} from 'zod';

/**
 * Чистая логика испытания дня (GDD §7.3).
 *
 * Лежит в shared, а не в сторе клиента, по той же причине, что рейтинг и
 * профиль: эти же правила понадобятся серверу, когда появится общая таблица,
 * и расходиться двум реализациям нельзя. Стор клиента только хранит
 * результат и зовёт эти функции.
 */

export const DailyAttemptSchema = z.object({
	/** Лучшее время в мс. null — испытание ещё не пройдено. */
	bestTimeMs: z.number().int().nonnegative().nullable(),
	/** Лучший рейтинг за день. */
	bestStars: z.number().int().min(0).max(3),
	/** Сколько раз запускали. */
	attempts: z.number().int().nonnegative(),
});
export type DailyAttempt = z.infer<typeof DailyAttemptSchema>;

export const EMPTY_ATTEMPT: DailyAttempt = {bestTimeMs: null, bestStars: 0, attempts: 0};

/** Награда за прохождение и доплата за три звезды (GDD §7.3). */
export const DAILY_CLEAR_REWARD = 50;
export const DAILY_THREE_STAR_REWARD = 50;

export type DailyRunResult = {win: boolean; timeMs: number; stars: number};

/**
 * Дата испытания: UTC, `YYYY-MM-DD`.
 *
 * Сознательно отличается от дейлик-награды, которая живёт по местному дню.
 * Награду игрок забирает сам у себя, а испытание общее, и таблица имеет
 * смысл только когда все играют один уровень в одно окно: при локальной дате
 * игрок в UTC+12 уже проходил бы завтрашний уровень, пока сосед доигрывает
 * вчерашний.
 */
export function challengeDate(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** Предыдущий день для `YYYY-MM-DD`. Считается через UTC, без сдвигов. */
export function previousDate(isoDate: string): string {
	const d = new Date(`${isoDate}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

/**
 * Слияние результата дня. Лучшее время и лучший рейтинг липкие: неудачная
 * попытка после удачной не должна стирать рекорд — ровно как `mergeRecord`
 * в кампании.
 */
export function mergeDailyAttempt(prev: DailyAttempt, run: DailyRunResult): DailyAttempt {
	if (!run.win) return prev;
	return {
		attempts: prev.attempts,
		bestStars: Math.max(prev.bestStars, run.stars),
		bestTimeMs: prev.bestTimeMs === null ? run.timeMs : Math.min(prev.bestTimeMs, run.timeMs),
	};
}

/**
 * Монеты за забег. Платится один раз за день за первое прохождение и один
 * раз за первые три звезды: иначе испытание превращается в ферму монет
 * повторными забегами.
 */
export function dailyReward(prev: DailyAttempt, run: DailyRunResult): number {
	if (!run.win) return 0;
	let coins = 0;
	if (prev.bestTimeMs === null) coins += DAILY_CLEAR_REWARD;
	if (run.stars >= 3 && prev.bestStars < 3) coins += DAILY_THREE_STAR_REWARD;
	return coins;
}

export type StreakState = {streakDays: number; longestStreak: number; lastClearedDate: string | null};

/**
 * Серия дней. Растёт только когда пройден день, следующий за последним
 * пройденным; повторная победа в тот же день её не накручивает, пропуск
 * обнуляет.
 */
export function advanceStreak(state: StreakState, isoDate: string, win: boolean): StreakState {
	if (!win || state.lastClearedDate === isoDate) return state;
	const streakDays = state.lastClearedDate === previousDate(isoDate) ? state.streakDays + 1 : 1;
	return {
		streakDays,
		longestStreak: Math.max(state.longestStreak, streakDays),
		lastClearedDate: isoDate,
	};
}
