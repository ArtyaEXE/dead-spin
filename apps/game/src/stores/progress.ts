import {createStore} from 'zustand/vanilla';
import {api} from '../net/client';
import type {ProgressLevel} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';
import {groupStore} from './group';
import {isGroupMode} from './mode';


type ProgressState = {
	summaryStars: number;
	levels: Record<number, ProgressLevel>;
	/** Group-mode records (per-chat). Null in single mode. */
	groupLevels: Record<number, ProgressLevel> | null;
	loaded: boolean;
	refresh: () => Promise<void>;
	recordLocal: (level: number, stars: number, timeMs: number, fuelSpent: number) => void;
};


export const progressStore = createStore<ProgressState>((set, get) => ({
	summaryStars: 0,
	levels: {},
	groupLevels: null,
	loaded: false,

	async refresh() {
		// Всегда загружаем global progress — он нужен для unlock gate и summaryStars.
		const globalRes = await api.progress();
		const globalMap: Record<number, ProgressLevel> = {};
		for (const row of globalRes.levels) globalMap[row.level] = row;

		let groupMap: Record<number, ProgressLevel> | null = null;
		if (isGroupMode()) {
			const g = groupStore.getState();
			if (g.chatId !== null && g.hmac !== null) {
				const groupRes = await api.groupProgress(g.chatId, g.hmac);
				groupMap = {};
				for (const row of groupRes.levels) groupMap[row.level] = row;
			}
		}

		set({
			summaryStars: globalRes.summaryStars,
			levels: globalMap,
			groupLevels: groupMap,
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
			// В group-mode обновляем и group-записи (оптимистично).
			groupLevels: get().groupLevels
				? {...get().groupLevels, [level]: entry}
				: null,
		});
	},
}));

export const useProgress = createSolidStoreAdapter(progressStore);
