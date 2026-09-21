import {createStore} from 'zustand/vanilla';
import {mergeRecord, type Rating} from '@dead-spin/shared';
import {api} from '../net/client';
import type {ProgressLevel} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';


type ProgressState = {
	summaryStars: number;
	levels: Record<number, ProgressLevel>;
	loaded: boolean;
	refresh: () => Promise<void>;
	recordLocal: (level: number, run: Rating & {timeMs: number; fuelSpent: number}) => void;
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

	recordLocal(level, run) {
		const existing = get().levels[level];
		// Флаги рейтинга липкие, время и топливо — минимумы (см. mergeRecord).
		const merged = mergeRecord(existing, run);
		if (existing && merged.stars === existing.stars && merged.timeMs === existing.timeMs && merged.fuelSpent === existing.fuelSpent) return;

		const newSummary = get().summaryStars + (merged.stars - (existing?.stars ?? 0));

		const entry: ProgressLevel = {
			userId: existing?.userId ?? '',
			level,
			...merged,
			updatedAt: new Date().toISOString(),
		};

		set({
			summaryStars: newSummary,
			levels: {...get().levels, [level]: entry},
		});
	},
}));

export const useProgress = createSolidStoreAdapter(progressStore);
