import {createStore} from 'zustand/vanilla';
import {api, ApiError} from '../net/client';
import type {GhostResponse} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';
import {groupStore} from './group';
import {challengeStore} from './challenge';


type GhostState = {
	/** Загруженный ghost для (chatId, level), null если ещё не было запроса. */
	current: GhostResponse | null;
	/** Был ли последний запрос успешным (для отличия "не загружали" от "404 нет ghost'а"). */
	loaded: boolean;
	/** Загрузить ghost для конкретного уровня в текущем groupContext. Безопасно вызывать без контекста — ничего не делает. */
	load: (level: number) => Promise<void>;
	clear: () => void;
};


/**
 * Стор для ghost-записи лидера в текущей беседе. Один ghost (текущий
 * выбранный уровень) live-в памяти. На смену уровня — re-load.
 *
 * 404 от API = «лидера/записи на этом уровне ещё нет». Это валидный
 * терминальный state: `loaded=true, current=null`. Ghost просто не
 * рендерится.
 */
export const ghostStore = createStore<GhostState>((set) => ({
	current: null,
	loaded: false,

	async load(level) {
		const g = groupStore.getState();
		if (g.chatId === null || g.hmac === null) {
			set({current: null, loaded: true});
			return;
		}

		// Если активный челлендж на этом уровне в этой беседе — показываем
		// ghost оппонента вместо leader-ghost. Если оппонент ещё не сыграл
		// (recording = null) — ghost не показываем вообще (это решение
		// по дизайну: пока соперник не сходил, играешь без подсказки).
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
	},

	clear() { set({current: null, loaded: false}); },
}));


export const useGhost = createSolidStoreAdapter(ghostStore);
