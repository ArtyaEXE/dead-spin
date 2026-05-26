import {createStore} from 'zustand/vanilla';
import {groupStore} from './group';
import {createSolidStoreAdapter} from './solid';


/**
 * Режим игры: single (глобальная кампания) или group (per-chat лидерборд).
 *
 * Определяет, какие API-маршруты вызывать и как отображать UI:
 *   single — sequential level unlock, global leaderboard, global ghost
 *   group  — free level select (все разблокированные), per-chat LB, per-chat ghost
 *
 * Доступен только если Mini App открыт из группы (chatId !== null).
 * Из DM — всегда single, переключатель не показывается.
 *
 * Default при открытии из группы = group (юзер пришёл соревноваться).
 */

export type GameMode = 'single' | 'group';


type ModeState = {
	mode: GameMode;
	/** true если chatId доступен (Mini App открыт из группы). */
	hasGroupContext: boolean;
	setMode: (mode: GameMode) => void;
	hydrate: () => void;
};


export const modeStore = createStore<ModeState>((set) => ({
	mode: 'single',
	hasGroupContext: false,

	setMode(mode) {
		set({mode});
	},

	hydrate() {
		const g = groupStore.getState();
		const has = g.chatId !== null && g.hmac !== null;
		set({
			hasGroupContext: has,
			mode: has ? 'group' : 'single',
		});
	},
}));


export function isGroupMode(): boolean {
	return modeStore.getState().mode === 'group';
}


export const useMode = createSolidStoreAdapter(modeStore);
