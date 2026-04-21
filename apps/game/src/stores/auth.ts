import {createStore} from 'zustand/vanilla';
import {createSolidStoreAdapter} from './solid';
import {api, getToken, setToken, loginFake, loginTelegram} from '../net/client';
import type {User} from '../net/schemas';


type AuthState = {
	user: User | null;
	status: 'idle' | 'loading' | 'authed' | 'error';
	error: string | null;
	loginFake: (tgId: string, password: string) => Promise<void>;
	loginTelegram: (initData: string) => Promise<void>;
	refresh: () => Promise<void>;
	setUser: (u: User) => void;
	logout: () => void;
};


export const authStore = createStore<AuthState>((set) => ({
	user: null,
	status: 'idle',
	error: null,

	async loginFake(tgId, password) {
		set({status: 'loading', error: null});
		try {
			const res = await loginFake(tgId, password);
			set({user: res.user, status: 'authed'});
		} catch (err) {
			setToken(null);
			const msg = err instanceof Error ? err.message : 'loginFailed';
			set({status: 'error', error: msg});
		}
	},

	async loginTelegram(initData) {
		set({status: 'loading', error: null});
		try {
			const res = await loginTelegram(initData);
			set({user: res.user, status: 'authed'});
		} catch (err) {
			setToken(null);
			const msg = err instanceof Error ? err.message : 'loginFailed';
			set({status: 'error', error: msg});
		}
	},

	async refresh() {
		if (!getToken()) return;
		try {
			const res = await api.me();
			set({user: res.user, status: 'authed'});
		} catch {
			setToken(null);
			set({user: null, status: 'idle'});
		}
	},

	setUser(u) { set({user: u}); },
	logout() { setToken(null); set({user: null, status: 'idle', error: null}); },
}));


export const useAuth = createSolidStoreAdapter(authStore);
