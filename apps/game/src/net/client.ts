import type {ZodTypeAny} from 'zod';
import type {GhostRecording} from '@dead-spin/shared';
import {API_BASE} from '../config';
import {groupStore} from '../stores/group';
import {isGroupMode} from '../stores/mode';
import {
	LoginResponseSchema, MeResponseSchema, ProgressResponseSchema,
	LevelCompleteResponseSchema, FuelSpendResponseSchema, LeaderboardResponseSchema,
	GhostResponseSchema, GroupInfoResponseSchema,
	DailyStateResponseSchema, DailyClaimResponseSchema,
	AchievementsResponseSchema, SpendCoinsResponseSchema,
	ActiveChallengeResponseSchema, SetSkinResponseSchema, SimpleOkSchema,
	PendingPushResponseSchema,
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


export async function loginFake(tgId: string, password: string) {
	const result = await request('POST', '/auth/telegram', LoginResponseSchema, {tgId, password});
	setToken(result.token);
	return result;
}


export async function loginTelegram(initData: string) {
	const result = await request('POST', '/auth/telegram', LoginResponseSchema, {initData});
	setToken(result.token);
	return result;
}


/**
 * Получить group-контекст для API-вызова. Возвращает объект с chatId/hmac
 * только если режим = group И контекст доступен. Иначе null.
 */
function groupCtx(): {chatId: number; hmac: string} | null {
	if (!isGroupMode()) return null;
	const g = groupStore.getState();
	if (g.chatId === null || g.hmac === null) return null;
	return {chatId: g.chatId, hmac: g.hmac};
}


export const api = {
	me: () => request('GET', '/me', MeResponseSchema),

	progress: () => request('GET', '/progress', ProgressResponseSchema),

	groupProgress: (chatId: number, hmac: string) =>
		request('GET', `/progress/group/${chatId}?hmac=${hmac}`, ProgressResponseSchema),

	levelComplete: (body: {
		level: number; stars: number; timeMs: number; fuelSpent: number;
		recording?: GhostRecording;
	}) => {
		// В group-режиме: enrichaем chatId+hmac → сервер запишет и в group,
		// и в global (если new best). Recording (ghost) отправляем всегда
		// (нужен для global_ghosts в single тоже).
		const g = groupCtx();
		const enriched = g
			? {...body, groupChatId: g.chatId, groupHmac: g.hmac}
			: body;
		return request('POST', '/progress/level-complete', LevelCompleteResponseSchema, enriched);
	},

	fuelSpend: (amount: number) => request('POST', '/fuel/spend', FuelSpendResponseSchema, {amount}),

	leaderboard: (level: number, limit = 20) => {
		const g = groupCtx();
		const path = g
			? `/leaderboard/group/${g.chatId}/${level}?limit=${limit}&hmac=${g.hmac}`
			: `/leaderboard/${level}?limit=${limit}`;
		return request('GET', path, LeaderboardResponseSchema);
	},

	globalGhost: (level: number) =>
		request('GET', `/leaderboard/${level}/ghost`, GhostResponseSchema),

	groupGhost: (chatId: number, hmac: string, level: number) =>
		request('GET', `/leaderboard/group/${chatId}/${level}/ghost?hmac=${hmac}`, GhostResponseSchema),

	groupInfo: (chatId: number, hmac: string) =>
		request('GET', `/groups/${chatId}/info?hmac=${hmac}`, GroupInfoResponseSchema),

	dailyState: () => request('GET', '/me/daily', DailyStateResponseSchema),
	claimDaily: () => request('POST', '/me/daily', DailyClaimResponseSchema, {}),
	achievements: () => request('GET', '/me/achievements', AchievementsResponseSchema),

	markTutorialSeen: (key: string) =>
		request('POST', '/me/tutorial-seen', SimpleOkSchema, {key}),

	setSkin: (skin: string) =>
		request('POST', '/me/skin', SetSkinResponseSchema, {skin}),

	activeChallenge: () => request('GET', '/challenges/active', ActiveChallengeResponseSchema),

	pendingPush: () => request('GET', '/challenges/pending-push', PendingPushResponseSchema),

	spendCoins: (amount: number, reason: string) =>
		request('POST', '/me/spend-coins', SpendCoinsResponseSchema, {amount, reason}),
};
