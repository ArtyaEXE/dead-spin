import {createStore} from 'zustand/vanilla';
import {parseGroupStartParam} from '@dead-spin/shared';
import {api} from '../net/client';
import {createSolidStoreAdapter} from './solid';


type GroupState = {
	chatId: number | null;
	hmac: string | null;
	/** Метаданные беседы из API — title, кастомные nickname/emoji. */
	title: string | null;
	nickname: string | null;
	emoji: string | null;
	hydrate: () => void;
	loadInfo: () => Promise<void>;
	setTitle: (title: string | null) => void;
	clear: () => void;
};


/**
 * Групповой контекст, в рамках которого открыт Mini App.
 *
 * Источники start_param (по приоритету):
 *   1) `?g=g_<chatId>_<hmac>` в `window.location.search` — приходит, когда
 *      Mini App открывают через inline-кнопку `web_app` бота в группе.
 *   2) `Telegram.WebApp.initDataUnsafe.start_param` — для запуска через
 *      direct-link `t.me/<bot>/<app>?startapp=...` (на будущее, если
 *      перейдём на этот формат).
 *
 * Пока контекст есть — все API-запросы записи прогресса дополнительно
 * шлют `groupChatId + groupHmac`, и результат пишется в групповой
 * лидерборд (см. `apps/api/src/routes/progress.ts`).
 */
export const groupStore = createStore<GroupState>((set, get) => ({
	chatId: null,
	hmac: null,
	title: null,
	nickname: null,
	emoji: null,

	hydrate() {
		if (typeof window === 'undefined') return;

		// 1) URL-параметр (web_app inline button)
		const urlParam = new URLSearchParams(window.location.search).get('g');
		// 2) Telegram start_param (direct-link)
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

	clear() { set({chatId: null, hmac: null, title: null, nickname: null, emoji: null}); },
}));


export const useGroup = createSolidStoreAdapter(groupStore);
