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

	const res = await fetch(`${API_BASE}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	let data: unknown = null;
	try { data = await res.json(); } catch { /* empty */ }

	if (!res.ok) {
		const err = (data && typeof data === 'object' && 'error' in data) ? String((data as {error: unknown}).error) : 'httpError';
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
