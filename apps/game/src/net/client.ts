import type {ZodTypeAny} from 'zod';
import {API_BASE} from '../config';
import {
	LoginResponseSchema, MeResponseSchema, ProgressResponseSchema,
	LevelCompleteResponseSchema, FuelSpendResponseSchema, LeaderboardResponseSchema,
} from './schemas';


const TOKEN_KEY = 'dead-spin.token';

export function getToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
	if (token) localStorage.setItem(TOKEN_KEY, token);
	else localStorage.removeItem(TOKEN_KEY);
}


export class ApiError extends Error {
	constructor(public status: number, public code: string, msg?: string) {
		super(msg ?? code);
	}
}


async function request<S extends ZodTypeAny>(
	method: 'GET' | 'POST',
	path: string,
	schema: S,
	body?: unknown,
): Promise<ReturnType<S['parse']>> {
	const headers: Record<string, string> = {'content-type': 'application/json'};
	const token = getToken();
	if (token) headers['authorization'] = `Bearer ${token}`;

	const url = `${API_BASE}${path}`;
	const t0 = Date.now();
	console.log(`[fetch ←] ${method} ${url}`);

	let res: Response;
	try {
		res = await fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	} catch (netErr) {
		// Network-level failure: ERR_CONNECTION_RESET, ENOTFOUND, TLS errors,
		// CORS preflight failure. Логируем максимум деталей для диагностики
		// мобильных WebView-проблем (особенно Android).
		const ms = Date.now() - t0;
		const msg = netErr instanceof Error ? `${netErr.name}: ${netErr.message}` : String(netErr);
		console.error(`[fetch ✗ NETWORK] ${method} ${url} after ${ms}ms — ${msg}`);
		console.error(`[fetch ✗ NETWORK] navigator.onLine=${navigator.onLine} ua=${navigator.userAgent.slice(0, 80)}`);
		throw new ApiError(0, 'networkFailure', msg);
	}

	const ms = Date.now() - t0;
	console.log(`[fetch →] ${method} ${url} ${res.status} ${ms}ms`);

	let data: unknown = null;
	try { data = await res.json(); } catch { /* empty */ }

	if (!res.ok) {
		const err = (data && typeof data === 'object' && 'error' in data) ? String((data as {error: unknown}).error) : 'httpError';
		console.warn(`[fetch ✗ HTTP] ${method} ${url} status=${res.status} body=${err}`);
		throw new ApiError(res.status, err);
	}

	return schema.parse(data);
}


/** Fake-user login для dev (требует TEST=1 и FAKE_USER_PASSWORD на сервере). */
export async function loginFake(tgId: string, password: string) {
	const result = await request('POST', '/auth/telegram', LoginResponseSchema, {tgId, password});
	setToken(result.token);
	return result;
}


/** Реальный Telegram-logIn через initData из Mini App. */
export async function loginTelegram(initData: string) {
	const result = await request('POST', '/auth/telegram', LoginResponseSchema, {initData});
	setToken(result.token);
	return result;
}


export const api = {
	me: () => request('GET', '/me', MeResponseSchema),
	progress: () => request('GET', '/progress', ProgressResponseSchema),
	levelComplete: (body: {level: number; stars: number; timeMs: number; fuelSpent: number}) =>
		request('POST', '/progress/level-complete', LevelCompleteResponseSchema, body),
	fuelSpend: (amount: number) => request('POST', '/fuel/spend', FuelSpendResponseSchema, {amount}),
	leaderboard: (level: number, limit = 20) =>
		request('GET', `/leaderboard/${level}?limit=${limit}`, LeaderboardResponseSchema),
};
