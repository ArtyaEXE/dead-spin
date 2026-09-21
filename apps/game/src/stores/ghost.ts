import {createStore} from 'zustand/vanilla';
import {api, ApiError} from '../net/client';
import type {GhostResponse} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';

type GhostState = {
	current: GhostResponse | null;
	loaded: boolean;
	load: (level: number) => Promise<void>;
	clear: () => void;
};

/**
 * Ghost-запись глобального лидера уровня — GET /leaderboard/:level/ghost.
 *
 * 404 = записи нет → `loaded=true, current=null`, ghost не рендерится.
 */
export const ghostStore = createStore<GhostState>((set) => ({
	current: null,
	loaded: false,

	async load(level) {
		try {
			const res = await api.globalGhost(level);
			set({current: res, loaded: true});
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				set({current: null, loaded: true});
				return;
			}
			console.warn('global ghost load failed:', e instanceof Error ? e.message : e);
			set({current: null, loaded: true});
		}
	},

	clear() {
		set({current: null, loaded: false});
	},
}));

export const useGhost = createSolidStoreAdapter(ghostStore);
