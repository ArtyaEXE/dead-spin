import {createStore} from 'zustand/vanilla';
import {z} from 'zod';
import {mergeRecord, type Rating} from '@dead-spin/shared';
import {api} from '../net/client';
import {ProgressLevelSchema, type ProgressLevel} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';
import {loadJson, saveJson} from '../lib/persist';


/**
 * Прогресс по уровням — на устройстве (GDD §16.2). Загружается из хранилища
 * до любого сетевого запроса, поэтому уровни доступны сразу и без сети.
 * Серверная копия при refresh() сливается с локальной по mergeRecord.
 */


const KEY = 'dead-spin.progress.v1';
const LevelsSchema = z.record(z.string(), ProgressLevelSchema);


function sumStars(levels: Record<number, ProgressLevel>): number {
	let s = 0;
	for (const r of Object.values(levels)) s += r.stars;
	return s;
}


function loadLevels(): Record<number, ProgressLevel> {
	const raw = loadJson<Record<string, ProgressLevel>>(KEY, LevelsSchema, () => ({}));
	const out: Record<number, ProgressLevel> = {};
	for (const [k, v] of Object.entries(raw)) out[Number(k)] = v;
	return out;
}


type ProgressState = {
	summaryStars: number;
	levels: Record<number, ProgressLevel>;
	loaded: boolean;
	refresh: () => Promise<void>;
	recordLocal: (level: number, run: Rating & {timeMs: number; fuelSpent: number}) => void;
};


export const progressStore = createStore<ProgressState>((set, get) => ({
	summaryStars: sumStars(loadLevels()),
	levels: loadLevels(),
	loaded: true,

	/** Слить серверную копию с локальной. Без сети — no-op, локальное остаётся. */
	async refresh() {
		const res = await api.progress();
		const map: Record<number, ProgressLevel> = {...get().levels};
		let changed = false;
		for (const row of res.levels) {
			const local = map[row.level];
			const merged = mergeRecord(local, {stars: row.stars, parHit: row.parHit, fullClear: row.fullClear, timeMs: row.timeMs, fuelSpent: row.fuelSpent});
			if (!local || merged.stars !== local.stars || merged.timeMs !== local.timeMs || merged.fuelSpent !== local.fuelSpent) {
				map[row.level] = {...row, ...merged};
				changed = true;
			}
		}
		if (!changed) return;
		saveJson(KEY, map);
		set({summaryStars: sumStars(map), levels: map, loaded: true});
	},

	recordLocal(level, run) {
		const existing = get().levels[level];
		// Флаги рейтинга липкие, время и топливо — минимумы (см. mergeRecord).
		const merged = mergeRecord(existing, run);
		if (existing && merged.stars === existing.stars && merged.timeMs === existing.timeMs && merged.fuelSpent === existing.fuelSpent) return;

		const entry: ProgressLevel = {
			userId: existing?.userId ?? '',
			level,
			...merged,
			updatedAt: new Date().toISOString(),
		};
		const levels = {...get().levels, [level]: entry};
		saveJson(KEY, levels);
		set({summaryStars: sumStars(levels), levels});
	},
}));

export const useProgress = createSolidStoreAdapter(progressStore);
