import {env} from '../config';


/**
 * Минимальный HTTP-клиент Telegram Bot API из API-сервиса. API и бот живут
 * в разных Render-сервисах (см. render.yaml), поэтому делать выходящие
 * вызовы через grammy-инстанс не получится — она в боте. Зато bot token
 * у API уже есть (нужен для проверки initData), и сам Telegram API —
 * это просто HTTPS.
 *
 * Все вызовы best-effort: ошибки логируем и не пробрасываем — нотификация
 * не должна валить запись прогресса.
 */


const BOT_API = 'https://api.telegram.org';


type GetChatMemberResponse = {
	ok: boolean;
	result?: {status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked'};
};


/** `getChatMember` — для верификации, что юзер реально в беседе. */
export async function tgGetChatMemberStatus(chatId: number, tgUserId: string): Promise<string | null> {
	if (!env.TELEGRAM_BOT_TOKEN) return null;
	const url = `${BOT_API}/bot${env.TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${tgUserId}`;
	try {
		const r = await fetch(url);
		if (!r.ok) return null;
		const data = await r.json() as GetChatMemberResponse;
		if (!data.ok || !data.result) return null;
		return data.result.status;
	} catch (e) {
		console.warn('tgGetChatMemberStatus failed:', e instanceof Error ? e.message : e);
		return null;
	}
}


/** `sendMessage` — нотификация в беседу. parse_mode HTML, без всплывашки. */
export async function tgSendMessage(chatId: number, html: string): Promise<void> {
	if (!env.TELEGRAM_BOT_TOKEN) return;
	if (!html) return;
	const url = `${BOT_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
	try {
		const r = await fetch(url, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				chat_id: chatId,
				text: html,
				parse_mode: 'HTML',
				disable_notification: true,
			}),
		});
		if (!r.ok) {
			const body = await r.text().catch(() => '');
			console.warn(`tgSendMessage non-2xx: ${r.status} ${body.slice(0, 200)}`);
		}
	} catch (e) {
		console.warn('tgSendMessage failed:', e instanceof Error ? e.message : e);
	}
}
