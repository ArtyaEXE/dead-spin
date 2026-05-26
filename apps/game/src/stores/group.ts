import {createStore} from 'zustand/vanilla';
import {parseGroupStartParam} from '@dead-spin/shared';
import {api} from '../net/client';
import {createSolidStoreAdapter} from './solid';


type GroupState = {
	chatId: number | null;
	hmac: string | null;
	title: string | null;
	nickname: string | null;
	emoji: string | null;
	hydrate: () => void;
	loadInfo: () => Promise<void>;
	setTitle: (title: string | null) => void;
	clear: () => void;
};


/**
 * Групповой контекст — transport-данные (chatId + HMAC). Скины и
 * туториалы больше не per-context: они глобальные (users.*).
 *
 * Режим single/group вынесен в modeStore — groupStore хранит только
 * «откуда открыли» (transport), а не «во что играем» (mode).
 */
export const groupStore = createStore<GroupState>((set, get) => ({
	chatId: null,
	hmac: null,
	title: null,
	nickname: null,
	emoji: null,

	hydrate() {
		if (typeof window === 'undefined') return;
		const urlParam = new URLSearchParams(window.location.search).get('g');
		const tgParam = (window as unknown as {
			Telegram?: {WebApp?: {initDataUnsafe?: {start_param?: string}}};
		}).Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;

		const parsed = parseGroupStartParam(urlParam) ?? parseGroupStartParam(tgParam);
		if (!parsed) return;
		set({chatId: parsed.chatId, hmac: parsed.hmac});
	},

	async loadInfo() {
		const {chatId, hmac} = get();
		if (chatId === null || hmac === null) return;
		try {
			const info = await api.groupInfo(chatId, hmac);
			set({title: info.title, nickname: info.nickname, emoji: info.emoji});
		} catch (e) {
			console.warn('groupInfo load failed:', e instanceof Error ? e.message : e);
		}
	},

	setTitle(title) { set({title}); },

	clear() {
		set({chatId: null, hmac: null, title: null, nickname: null, emoji: null});
	},
}));


export const useGroup = createSolidStoreAdapter(groupStore);
