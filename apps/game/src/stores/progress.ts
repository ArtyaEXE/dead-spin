import {createStore} from 'zustand/vanilla';
import {api} from '../net/client';
import type {ProgressLevel} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';


type ProgressState = {
	summaryStars: number;
	levels: Record<number, ProgressLevel>;
	loaded: boolean;
	refresh: () => Promise<void>;
	recordLocal: (level: number, stars: number, timeMs: number, fuelSpent: number) => void;
};


export const progressStore = createStore<ProgressState>((set, get) => ({
	summaryStars: 0,
	levels: {},
	loaded: false,

	async refresh() {
		const res = await api.progress();
		const map: Record<number, ProgressLevel> = {};
		for (const row of res.levels) map[row.level] = row;

		set({
			summaryStars: res.summaryStars,
			levels: map,
			loaded: true,
		});
	},

	recordLocal(level, stars, timeMs, fuelSpent) {
		const existing = get().levels[level];
		// Три показателя улучшаются независимо: медленный заход на 3★ не должен
		// стирать лучшее время, а быстрый на 1★ — не должен терять звёзды.
		const bestStars = existing ? Math.max(existing.stars, stars) : stars;
		const bestTime = existing ? Math.min(existing.timeMs, timeMs) : timeMs;
		const bestFuel = existing ? Math.min(existing.fuelSpent, fuelSpent) : fuelSpent;
		if (existing && bestStars === existing.stars && bestTime === existing.timeMs && bestFuel === existing.fuelSpent) return;

		const newSummary = get().summaryStars + (bestStars - (existing?.stars ?? 0));

		const entry: ProgressLevel = {
			userId: existing?.userId ?? '',
			level,
			stars: bestStars,
			timeMs: bestTime,
			fuelSpent: bestFuel,
			updatedAt: new Date().toISOString(),
		};

		set({
			summaryStars: newSummary,
			levels: {...get().levels, [level]: entry},
		});
	},
}));

export const useProgress = createSolidStoreAdapter(progressStore);
