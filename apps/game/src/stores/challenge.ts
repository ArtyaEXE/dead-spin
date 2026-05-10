import {createStore} from 'zustand/vanilla';
import {api, ApiError} from '../net/client';
import type {ActiveChallenge} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';


type ChallengeState = {
	current: ActiveChallenge | null;
	loading: boolean;
	refresh: () => Promise<void>;
	clear: () => void;
};


/**
 * Состояние единственного активного/pending челленджа юзера. Поллится
 * на `MainMenu.onMount` и при возврате к меню после уровня. Если null —
 * юзер свободен.
 *
 * Поллинг по таймеру делать не стали — события «принял / отказался /
 * отменил» бот шлёт через свой канал (Telegram-сообщения с edit), а
 * клиент перечитывает только при вход/выходе экранов. Этого достаточно
 * для текущего масштаба (5–10 тестеров).
 */
export const challengeStore = createStore<ChallengeState>((set) => ({
	current: null,
	loading: false,

	async refresh() {
		set({loading: true});
		try {
			const r = await api.activeChallenge();
			set({current: r.challenge, loading: false});
		} catch (e) {
			set({loading: false});
			if (e instanceof ApiError && (e.status === 401 || e.status === 0)) return;
			console.warn('activeChallenge failed:', e instanceof Error ? e.message : e);
		}
	},

	clear() { set({current: null}); },
}));


export const useChallenge = createSolidStoreAdapter(challengeStore);


/** "осталось 47:23" из ISO-строки. Если время уже вышло — null. */
export function formatTimeLeft(expiresAtISO: string): string | null {
	const ms = new Date(expiresAtISO).getTime() - Date.now();
	if (ms <= 0) return null;
	const totalMin = Math.floor(ms / 60000);
	const sec = Math.floor((ms % 60000) / 1000);
	if (totalMin >= 60) {
		const h = Math.floor(totalMin / 60);
		const m = totalMin % 60;
		return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
	}
	return `${totalMin}:${String(sec).padStart(2, '0')}`;
}
