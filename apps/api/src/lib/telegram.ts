import crypto from 'node:crypto';
import {HOUR, TELEGRAM_ID_REGEX} from '@dead-spin/shared';


export type InitDataOk = {
	ok: true;
	tgId: string;
	username: string;
	locale: string;
	authDate: number;
};
export type InitDataErr = {ok: false; error: string};
export type InitDataResult = InitDataOk | InitDataErr;


/**
 * Валидирует строку Telegram WebApp initData по алгоритму из docs:
 *
 *   secretKey = HMAC_SHA256(botToken, "WebAppData")
 *   signature = HMAC_SHA256(checkString, secretKey)
 *
 * checkString формируется из всех полей кроме `hash`, отсортированных
 * алфавитно, соединённых "\n".
 *
 * Логика 1:1 с `imports/lib/server/auth.js:28-37` старого проекта.
 */
export function validateInitData(initData: string, botToken: string): InitDataResult {
	if (typeof initData !== 'string' || initData.length < 64 || initData.length > 4096) {
		return {ok: false, error: 'initDataString'};
	}
	if (!botToken) return {ok: false, error: 'botToken'};

	let data: Record<string, string>;
	try {
		data = Object.fromEntries(new URLSearchParams(initData).entries());
	} catch {
		return {ok: false, error: 'initDataParse'};
	}

	const userStr = data['user'];
	if (!userStr || userStr.length < 16 || userStr.length > 2048) {
		return {ok: false, error: 'initData.user'};
	}

	let parsedUser: {id?: number | string; username?: string; language_code?: string};
	try {
		parsedUser = JSON.parse(userStr);
	} catch {
		return {ok: false, error: 'initData.userJson'};
	}

	const tgId = String(parsedUser?.id ?? '');
	if (!TELEGRAM_ID_REGEX.test(tgId)) return {ok: false, error: 'initData.user.id'};

	const authDate = Number(data['auth_date']);
	if (!Number.isInteger(authDate) || authDate < 1_718_536_894 || authDate > 17_185_368_940) {
		return {ok: false, error: 'initData.authDate'};
	}

	const hash = data['hash'];
	if (!hash) return {ok: false, error: 'initData.hash'};

	const checkString = Object.keys(data)
		.filter(k => k !== 'hash')
		.sort()
		.map(k => `${k}=${data[k]}`)
		.join('\n');

	const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
	const signature = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

	if (hash !== signature) return {ok: false, error: 'signature'};
	if (Math.abs(Date.now() - authDate * 1000) > 24 * HOUR) return {ok: false, error: 'expired'};

	const username = parsedUser.username || `user_${tgId}`;
	const locale = parsedUser.language_code || 'en';

	if (username.length < 1 || username.length > 128) return {ok: false, error: 'username'};
	if (locale.length < 1 || locale.length > 7) return {ok: false, error: 'locale'};

	return {ok: true, tgId, username, locale, authDate};
}
