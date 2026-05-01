import {createHmac} from 'node:crypto';
import {GROUP_HMAC_LEN} from './group-context';


/**
 * HMAC-подпись группового контекста. Используется ботом при формировании
 * deep-link и API при проверке клиентского запроса. Секрет — `botToken`
 * (его нельзя достать из клиента, поэтому подделать chatId без токена не
 * получится).
 *
 * Внимание: импортирует `node:crypto` — пользоваться **только** на сервере.
 * В Mini App импортируй `parseGroupStartParam` из `@dead-spin/shared`
 * (там без crypto).
 */


export function signGroupContext(chatId: number, secret: string): string {
	if (!secret) throw new Error('signGroupContext: empty secret');
	return createHmac('sha256', secret)
		.update(`group:${chatId}`)
		.digest('hex')
		.slice(0, GROUP_HMAC_LEN);
}


/** Constant-time string-equal (избегаем timing-атаки на проверку HMAC). */
export function verifyGroupContext(chatId: number, hmac: string, secret: string): boolean {
	if (typeof hmac !== 'string' || hmac.length !== GROUP_HMAC_LEN) return false;
	const expected = signGroupContext(chatId, secret);
	let diff = 0;
	for (let i = 0; i < GROUP_HMAC_LEN; i++) {
		diff |= hmac.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return diff === 0;
}
