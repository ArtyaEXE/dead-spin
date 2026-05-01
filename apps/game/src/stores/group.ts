import {createStore} from 'zustand/vanilla';
import {parseGroupStartParam} from '@dead-spin/shared';
import {createSolidStoreAdapter} from './solid';


type GroupState = {
	chatId: number | null;
	hmac: string | null;
	/** Заголовок беседы — приходит позже от API (опционально), для UI. */
	title: string | null;
	hydrate: () => void;
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
export const groupStore = createStore<GroupState>((set) => ({
	chatId: null,
	hmac: null,
	title: null,

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

	setTitle(title) { set({title}); },

	clear() { set({chatId: null, hmac: null, title: null}); },
}));


export const useGroup = createSolidStoreAdapter(groupStore);
