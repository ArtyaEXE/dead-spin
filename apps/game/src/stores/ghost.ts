import {createStore} from 'zustand/vanilla';
import {api, ApiError} from '../net/client';
import type {GhostResponse} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';
import {groupStore} from './group';
import {challengeStore} from './challenge';
import {isGroupMode} from './mode';


type GhostState = {
	current: GhostResponse | null;
	loaded: boolean;
	load: (level: number) => Promise<void>;
	clear: () => void;
};


/**
 * Ghost-запись лидера для текущего уровня.
 *
 * Режим определяет источник:
 *   single → GET /leaderboard/:level/ghost   (глобальный лидер)
 *   group  → GET /leaderboard/group/:chatId/:level/ghost (лидер чата)
 *          → или opponent-ghost если активный challenge на этом уровне
 *
 * 404 = записи нет → `loaded=true, current=null`, ghost не рендерится.
 */
export const ghostStore = createStore<GhostState>((set) => ({
	current: null,
	loaded: false,

	async load(level) {
		// --- Group mode: challenge ghost > leader ghost ---
		if (isGroupMode()) {
			const g = groupStore.getState();
			if (g.chatId === null || g.hmac === null) {
				set({current: null, loaded: true});
				return;
			}

			const ch = challengeStore.getState().current;
			if (ch && ch.status === 'active' && ch.chatId === g.chatId && ch.level === level) {
				if (ch.opponentRecording) {
					set({
						current: {
							level: ch.level,
							userId: 'opponent',
							username: ch.opponentUsername,
							stars: ch.opponentStars ?? 0,
							timeMs: ch.opponentTimeMs ?? 0,
							recording: ch.opponentRecording,
							recordedAt: new Date().toISOString(),
						},
						loaded: true,
					});
				} else {
					set({current: null, loaded: true});
				}
				return;
			}

			try {
				const res = await api.groupGhost(g.chatId, g.hmac, level);
				set({current: res, loaded: true});
			} catch (e) {
				if (e instanceof ApiError && e.status === 404) {
					set({current: null, loaded: true});
					return;
				}
				console.warn('ghost load failed:', e instanceof Error ? e.message : e);
				set({current: null, loaded: true});
			}
			return;
		}

		// --- Single mode: global ghost ---
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

	clear() { set({current: null, loaded: false}); },
}));


export const useGhost = createSolidStoreAdapter(ghostStore);
