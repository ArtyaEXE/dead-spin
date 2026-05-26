import {createStore} from 'zustand/vanilla';
import {api} from '../net/client';
import type {PendingPush} from '../net/schemas';
import {createSolidStoreAdapter} from './solid';


/**
 * Polling-based auto-push в челлендж. Клиент каждые POLL_MS проверяет
 * `GET /challenges/pending-push` пока юзер в меню (startPolling).
 * Один одноразовый check после level-complete/death (checkOnce).
 *
 * Когда pending push найден → `pending` заполняется, UI показывает
 * ChallengePushOverlay с countdown → автопереход на уровень.
 *
 * clearPending() вызывается после того как игрок зашёл на уровень
 * (или отклонил overlay, если такой UX захочется).
 */

const POLL_MS = 4_000;


type ChallengePushState = {
	pending: PendingPush | null;
	polling: boolean;
	startPolling: () => void;
	stopPolling: () => void;
	checkOnce: () => Promise<void>;
	clearPending: () => void;
};


export const challengePushStore = createStore<ChallengePushState>((set, get) => {
	let timer: ReturnType<typeof setInterval> | null = null;

	const doCheck = async (): Promise<void> => {
		try {
			const res = await api.pendingPush();
			if (res.push && !get().pending) {
				set({pending: res.push});
			}
		} catch {
			// Network errors are fine — polling will retry next tick.
		}
	};

	return {
		pending: null,
		polling: false,

		startPolling() {
			if (timer) return;
			timer = setInterval(() => { void doCheck(); }, POLL_MS);
			set({polling: true});
			void doCheck();
		},

		stopPolling() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
			set({polling: false});
		},

		async checkOnce() {
			await doCheck();
		},

		clearPending() {
			set({pending: null});
		},
	};
});


export const useChallengePush = createSolidStoreAdapter(challengePushStore);
