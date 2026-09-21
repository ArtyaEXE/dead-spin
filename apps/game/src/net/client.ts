import type {ZodTypeAny} from 'zod';
import type {GhostRecording, Profile} from '@dead-spin/shared';
import {API_BASE} from '../config';
import {
	LoginResponseSchema, MeResponseSchema, ProgressResponseSchema,
	LevelCompleteResponseSchema, LeaderboardResponseSchema,
	GhostResponseSchema,
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
	method: 'GET' | 'POST' | 'PUT',
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


const DEVICE_KEY = 'dead-spin.deviceId';

function uuid4(): string {
	const b = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
		crypto.getRandomValues(b);
	} else {
		for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
	}
	// Версия 4 и вариант RFC 4122 — сервер валидирует формат через z.uuid().
	b[6] = (b[6]! & 0x0f) | 0x40;
	b[8] = (b[8]! & 0x3f) | 0x80;
	const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}


/**
 * Идентификатор устройства — заменяет Telegram-аккаунт. Генерируется один
 * раз при первом запуске и живёт в localStorage. Учётки как таковой нет:
 * устройство и есть учётка, экрана логина игрок не видит.
 */
export function getDeviceId(): string {
	let id = localStorage.getItem(DEVICE_KEY);
	if (!id) {
		id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : uuid4();
		localStorage.setItem(DEVICE_KEY, id);
	}
	return id;
}


export async function loginDevice() {
	const result = await request('POST', '/auth/device', LoginResponseSchema, {
		deviceId: getDeviceId(),
		locale: (navigator.language || 'en').slice(0, 2),
	});
	setToken(result.token);
	return result;
}


export const api = {
	me: () => request('GET', '/me', MeResponseSchema),

	progress: () => request('GET', '/progress', ProgressResponseSchema),

	levelComplete: (body: {
		level: number; collected: number; timeMs: number; fuelSpent: number;
		recording?: GhostRecording;
	}) => request('POST', '/progress/level-complete', LevelCompleteResponseSchema, body),

	leaderboard: (level: number, limit = 20) =>
		request('GET', `/leaderboard/${level}?limit=${limit}`, LeaderboardResponseSchema),

	globalGhost: (level: number) =>
		request('GET', `/leaderboard/${level}/ghost`, GhostResponseSchema),

	/** Снимок профиля устройства → серверная копия (см. stores/sync.ts). */
	putProfile: (profile: Profile) => request('PUT', '/me/profile', MeResponseSchema, profile),
};
