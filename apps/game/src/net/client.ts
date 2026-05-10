import type {ZodTypeAny} from 'zod';
import type {GhostRecording} from '@dead-spin/shared';
import {API_BASE} from '../config';
import {groupStore} from '../stores/group';
import {
	LoginResponseSchema, MeResponseSchema, ProgressResponseSchema,
	LevelCompleteResponseSchema, FuelSpendResponseSchema, LeaderboardResponseSchema,
	GhostResponseSchema, GroupInfoResponseSchema,
	DailyStateResponseSchema, DailyClaimResponseSchema,
	AchievementsResponseSchema, SpendCoinsResponseSchema,
	ActiveChallengeResponseSchema, SetSkinResponseSchema,
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
	/** Глобальный прогресс игрока (DM-сценарий). */
	progress: () => request('GET', '/progress', ProgressResponseSchema),
	/** Прогресс в рамках конкретной беседы — отдельный «save» per chat. */
	groupProgress: (chatId: number, hmac: string) =>
		request('GET', `/progress/group/${chatId}?hmac=${hmac}`, ProgressResponseSchema),
	levelComplete: (body: {
		level: number; stars: number; timeMs: number; fuelSpent: number;
		recording?: GhostRecording;
	}) => {
		// Если игра открыта в групповом контексте (через `/play` в беседе),
		// добавляем chatId+hmac — сервер запишет результат и в групповой
		// лидерборд, плюс при необходимости пушнёт нотификацию в чат.
		// Recording (ghost-запись) отправляем только в групповом контексте —
		// в DM-сценарии она бесполезна и только нагружает payload.
		const g = groupStore.getState();
		const enriched = g.chatId !== null && g.hmac !== null
			? {...body, groupChatId: g.chatId, groupHmac: g.hmac}
			: {...body, recording: undefined};
		return request('POST', '/progress/level-complete', LevelCompleteResponseSchema, enriched);
	},
	fuelSpend: (amount: number) => request('POST', '/fuel/spend', FuelSpendResponseSchema, {amount}),
	leaderboard: (level: number, limit = 20) => {
		// В групповом контексте показываем лидерборд только этой беседы.
		const g = groupStore.getState();
		const path = g.chatId !== null && g.hmac !== null
			? `/leaderboard/group/${g.chatId}/${level}?limit=${limit}&hmac=${g.hmac}`
			: `/leaderboard/${level}?limit=${limit}`;
		return request('GET', path, LeaderboardResponseSchema);
	},
	groupGhost: (chatId: number, hmac: string, level: number) =>
		request('GET', `/leaderboard/group/${chatId}/${level}/ghost?hmac=${hmac}`, GhostResponseSchema),
	groupInfo: (chatId: number, hmac: string) =>
		request('GET', `/groups/${chatId}/info?hmac=${hmac}`, GroupInfoResponseSchema),
	dailyState: () => request('GET', '/me/daily', DailyStateResponseSchema),
	claimDaily: () => request('POST', '/me/daily', DailyClaimResponseSchema, {}),
	achievements: () => request('GET', '/me/achievements', AchievementsResponseSchema),
	setSkin: (skin: string) => {
		// В group-контексте отправляем groupChatId+hmac — сервер сохранит
		// per-chat override в user_group_skins вместо DM-выбора.
		const g = groupStore.getState();
		const body = g.chatId !== null && g.hmac !== null
			? {skin, groupChatId: g.chatId, groupHmac: g.hmac}
			: {skin};
		// Group-ответ возвращает {groupSelectedSkin}, DM — {user}. Парсим
		// схемой union; на клиенте сами разруливаем какой случай.
		return request('POST', '/me/skin', SetSkinResponseSchema, body);
	},
	activeChallenge: () => request('GET', '/challenges/active', ActiveChallengeResponseSchema),
	spendCoins: (amount: number, reason: string) =>
		request('POST', '/me/spend-coins', SpendCoinsResponseSchema, {amount, reason}),
};
