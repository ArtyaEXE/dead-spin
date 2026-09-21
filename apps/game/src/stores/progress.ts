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
		if (existing && (stars < existing.stars ||
			(stars === existing.stars && timeMs >= existing.timeMs))) return;

		const newSummary = existing
			? get().summaryStars + Math.max(0, stars - existing.stars)
			: get().summaryStars + stars;

		const entry: ProgressLevel = {
			userId: existing?.userId ?? '',
			level,
			stars,
			timeMs,
			fuelSpent,
			updatedAt: new Date().toISOString(),
		};

		set({
			summaryStars: newSummary,
			levels: {...get().levels, [level]: entry},
		});
	},
}));

export const useProgress = createSolidStoreAdapter(progressStore);
