import {createStore} from 'zustand/vanilla';
import {api} from '../net/client';
import type {ProgressLevel} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';
import {groupStore} from './group';


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
		// Прогресс в группе считается отдельно от DM-прогресса. Если игра
		// открыта через `/play` в беседе — лидерборд/уровни показывают
		// "чистый" прогресс этой беседы, даже если игрок ранее всё прошёл
		// в DM или другой группе.
		const g = groupStore.getState();
		const res = g.chatId !== null && g.hmac !== null
			? await api.groupProgress(g.chatId, g.hmac)
			: await api.progress();
		const map: Record<number, ProgressLevel> = {};
		for (const row of res.levels) map[row.level] = row;
		set({summaryStars: res.summaryStars, levels: map, loaded: true});

		// В group-ответе сервер кладёт selectedSkin (или null если override
		// для этого чата нет). Сохраняем в groupStore — getActiveSkinId
		// возьмёт его в group-контексте.
		if (g.chatId !== null && 'selectedSkin' in res) {
			groupStore.getState().setSelectedSkin(res.selectedSkin ?? null);
		}
	},

	recordLocal(level, stars, timeMs, fuelSpent) {
		const existing = get().levels[level];
		if (existing && (stars < existing.stars ||
			(stars === existing.stars && timeMs >= existing.timeMs))) return;

		const newSummary = existing
			? get().summaryStars + Math.max(0, stars - existing.stars)
			: get().summaryStars + stars;

		set({
			summaryStars: newSummary,
			levels: {
				...get().levels,
				[level]: {
					userId: existing?.userId ?? '',
					level,
					stars,
					timeMs,
					fuelSpent,
					updatedAt: new Date().toISOString(),
				},
			},
		});
	},
}));

export const useProgress = createSolidStoreAdapter(progressStore);
