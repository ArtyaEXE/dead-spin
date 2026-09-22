import {createStore} from 'zustand/vanilla';
import {z} from 'zod';
import {
	advanceStreak,
	challengeDate,
	DailyAttemptSchema,
	dailyReward,
	EMPTY_ATTEMPT,
	mergeDailyAttempt,
	type DailyAttempt,
	type DailyRunResult,
} from '@dead-spin/shared';
import {createSolidStoreAdapter} from './solid';
import {loadJson, saveJson} from '../lib/persist';
import {profileStore} from './profile';

/**
 * Испытание дня (GDD §7.3, §19 этап B).
 *
 * Тридцать уровней кампании проходятся за полтора часа, а KPI проекта —
 * возврат на седьмой день. Испытание дня это единственная механика плана,
 * которая даёт причину открыть игру завтра: уровень генерируется из даты,
 * он одинаковый у всех, и он исчезает в полночь.
 *
 * Стор хранит только результат. Сам уровень не сохраняется никогда: он
 * детерминированно пересобирается из даты (`dailyLevel`), и держать его
 * копию значило бы завести второй источник правды.
 *
 * Правила слияния результата, награды и серии живут в `@dead-spin/shared`:
 * они же понадобятся серверу, когда появится общая таблица.
 */

export {challengeDate};
export type {DailyAttempt};

const DailyStateSchema = z.object({
	v: z.literal(1).default(1),
	/** Результаты по датам. Храним только последние дни — см. PRUNE_DAYS. */
	days: z.record(z.string(), DailyAttemptSchema).default({}),
	/** Серия дней, в которые испытание было пройдено. */
	streakDays: z.number().int().nonnegative().default(0),
	longestStreak: z.number().int().nonnegative().default(0),
	/** Последний пройденный день. Нужен, чтобы считать серию. */
	lastClearedDate: z.string().nullable().default(null),
	/** Максимальная виденная дата: защита от перевода часов назад. */
	maxSeenDate: z.string().nullable().default(null),
});
type DailyState = z.infer<typeof DailyStateSchema>;

const KEY = 'dead-spin.daily-challenge';
/** Сколько дней истории держим. Дальше она не нужна: таблица на сервере. */
const PRUNE_DAYS = 30;

function load(): DailyState {
	return loadJson(KEY, DailyStateSchema, () => ({
		v: 1 as const,
		days: {},
		streakDays: 0,
		longestStreak: 0,
		lastClearedDate: null,
		maxSeenDate: null,
	}));
}

function prune(days: Record<string, DailyAttempt>): Record<string, DailyAttempt> {
	const keys = Object.keys(days).sort();
	if (keys.length <= PRUNE_DAYS) return days;
	const out: Record<string, DailyAttempt> = {};
	for (const k of keys.slice(-PRUNE_DAYS)) {
		const v = days[k];
		if (v) out[k] = v;
	}
	return out;
}

export type DailyStore = DailyState & {
	/** Результат за конкретный день. Пустой, если в этот день не играли. */
	forDate: (isoDate: string) => DailyAttempt;
	/** Отметить запуск. Растит счётчик попыток. */
	start: (isoDate: string) => void;
	/** Записать итог забега: рекорд, серия, награда. */
	finish: (isoDate: string, run: DailyRunResult) => void;
};

function persist(s: DailyState): void {
	saveJson(KEY, {
		v: 1,
		days: s.days,
		streakDays: s.streakDays,
		longestStreak: s.longestStreak,
		lastClearedDate: s.lastClearedDate,
		maxSeenDate: s.maxSeenDate,
	});
}

export const dailyStore = createStore<DailyStore>((set, get) => ({
	...load(),

	forDate: (isoDate) => get().days[isoDate] ?? EMPTY_ATTEMPT,

	start: (isoDate) => {
		const s = get();
		const prev = s.days[isoDate] ?? EMPTY_ATTEMPT;
		set({
			days: prune({...s.days, [isoDate]: {...prev, attempts: prev.attempts + 1}}),
			// Дата только растёт: перевод часов назад не откатывает прогресс.
			maxSeenDate: s.maxSeenDate && s.maxSeenDate > isoDate ? s.maxSeenDate : isoDate,
		});
		persist(get());
	},

	finish: (isoDate, run) => {
		const s = get();
		const prev = s.days[isoDate] ?? EMPTY_ATTEMPT;
		const next = mergeDailyAttempt(prev, run);
		const coins = dailyReward(prev, run);
		const streak = advanceStreak(
			{streakDays: s.streakDays, longestStreak: s.longestStreak, lastClearedDate: s.lastClearedDate},
			isoDate,
			run.win,
		);

		set({days: prune({...s.days, [isoDate]: next}), ...streak});
		persist(get());

		if (coins > 0) profileStore.getState().addCoins(coins, 'daily_challenge');
	},
}));

export const useDaily = createSolidStoreAdapter(dailyStore);
