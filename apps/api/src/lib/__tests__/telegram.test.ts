import crypto from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {validateInitData} from '../telegram';


/**
 * Готовим реальную подписанную initData-строку по алгоритму Telegram,
 * чтобы проверить, что наш валидатор эту же строку принимает.
 */
function makeInitData(botToken: string, user: object, authDate: number): string {
	const fields: Record<string, string> = {
		auth_date: String(authDate),
		query_id: 'AAA-test',
		user: JSON.stringify(user),
	};

	const checkString = Object.keys(fields)
		.filter(k => k !== 'hash')
		.sort()
		.map(k => `${k}=${fields[k]}`)
		.join('\n');

	const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
	const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

	fields['hash'] = hash;
	return new URLSearchParams(fields).toString();
}


describe('validateInitData', () => {
	const botToken = '7000000000:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
	const user = {id: 123456789, username: 'alice', language_code: 'en'};

	it('accepts a valid signed initData', () => {
		const now = Math.floor(Date.now() / 1000);
		const initData = makeInitData(botToken, user, now);
		const result = validateInitData(initData, botToken);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tgId).toBe('123456789');
			expect(result.username).toBe('alice');
			expect(result.locale).toBe('en');
		}
	});

	it('rejects when signed with a different bot token', () => {
		const now = Math.floor(Date.now() / 1000);
		const initData = makeInitData('wrong-token:123', user, now);
		const result = validateInitData(initData, botToken);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('signature');
	});

	it('rejects expired auth_date (>24h old)', () => {
		const old = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
		const initData = makeInitData(botToken, user, old);
		const result = validateInitData(initData, botToken);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('expired');
	});

	it('rejects malformed strings early without crash', () => {
		expect(validateInitData('', botToken).ok).toBe(false);
		expect(validateInitData('garbage', botToken).ok).toBe(false);
	});

	it('rejects missing bot token', () => {
		const now = Math.floor(Date.now() / 1000);
		const initData = makeInitData(botToken, user, now);
		const result = validateInitData(initData, '');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('botToken');
	});

	it('uses fallback username when user has none', () => {
		const now = Math.floor(Date.now() / 1000);
		const initData = makeInitData(botToken, {id: 42, language_code: 'ru'}, now);
		const result = validateInitData(initData, botToken);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.username).toBe('user_42');
			expect(result.locale).toBe('ru');
		}
	});
});
