import {createStore} from 'zustand/vanilla';
import {createSolidStoreAdapter} from './solid';
import {api, getToken, setToken, loginDevice} from '../net/client';
import type {User} from '../net/schemas';
import {identify, track} from '../analytics';

type AuthState = {
	user: User | null;
	status: 'idle' | 'loading' | 'authed' | 'error';
	error: string | null;
	login: () => Promise<void>;
	refresh: () => Promise<void>;
	/** Старт приложения: обновить сессию по токену, иначе завести аккаунт. Не блокирует UI. */
	boot: () => Promise<void>;
	setUser: (u: User) => void;
	logout: () => void;
};

export const authStore = createStore<AuthState>((set, get) => ({
	user: null,
	status: 'idle',
	error: null,

	/**
	 * Анонимный вход по идентификатору устройства. Вызывается сам при
	 * старте приложения — игрок ничего не вводит и экрана логина в
	 * обычном течении не видит.
	 */
	async login() {
		set({status: 'loading', error: null});
		try {
			const res = await loginDevice();
			set({user: res.user, status: 'authed'});
			identify(res.user.id, {
				username: res.user.username,
				locale: res.user.locale,
			});
			track('login_success', {method: 'device'});
		} catch (err) {
			setToken(null);
			const msg = err instanceof Error ? err.message : 'loginFailed';
			set({status: 'error', error: msg});
			track('login_failed', {error: msg});
		}
	},

	async refresh() {
		if (!getToken()) return;
		try {
			const res = await api.me();
			set({user: res.user, status: 'authed'});
			identify(res.user.id, {
				username: res.user.username,
				locale: res.user.locale,
			});
		} catch {
			setToken(null);
			set({user: null, status: 'idle'});
		}
	},

	async boot() {
		if (getToken()) await get().refresh();
		if (get().status !== 'authed') await get().login();
	},

	setUser(u) {
		set({user: u});
	},
	logout() {
		setToken(null);
		set({user: null, status: 'idle', error: null});
	},
}));

export const useAuth = createSolidStoreAdapter(authStore);
