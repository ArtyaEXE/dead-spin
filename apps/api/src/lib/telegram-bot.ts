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


type GetChatResponse = {
	ok: boolean;
	result?: {
		id: number;
		type: 'private' | 'group' | 'supergroup' | 'channel';
		title?: string;
	};
};


/**
 * `getChat` — нужен для ленивой регистрации беседы в `group_chats`.
 * Когда бот в чате есть, но в БД записи нет (например, после wipe или
 * если my_chat_member пропустили), мы дёргаем getChat: если бот реально
 * в чате — Telegram вернёт meta, восстановим запись. Если нет — вернёт
 * ошибку, не делаем ничего.
 */
export async function tgGetChat(chatId: number): Promise<{type: 'group' | 'supergroup'; title: string} | null> {
	if (!env.TELEGRAM_BOT_TOKEN) return null;
	const url = `${BOT_API}/bot${env.TELEGRAM_BOT_TOKEN}/getChat?chat_id=${chatId}`;
	try {
		const r = await fetch(url);
		if (!r.ok) return null;
		const data = await r.json() as GetChatResponse;
		if (!data.ok || !data.result) return null;
		const t = data.result.type;
		if (t !== 'group' && t !== 'supergroup') return null;
		return {type: t, title: data.result.title ?? '(без названия)'};
	} catch (e) {
		console.warn('tgGetChat failed:', e instanceof Error ? e.message : e);
		return null;
	}
}


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


/**
 * `sendMessage` — нотификация в беседу. parse_mode HTML, без всплывашки.
 * Возвращает `message_id` для последующего `setMessageReaction`, или null
 * при любой ошибке (нотификация best-effort, не критична).
 */
export async function tgSendMessage(chatId: number, html: string): Promise<number | null> {
	if (!env.TELEGRAM_BOT_TOKEN) return null;
	if (!html) return null;
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
			return null;
		}
		const data = await r.json() as {ok: boolean; result?: {message_id?: number}};
		return data.ok && data.result?.message_id ? data.result.message_id : null;
	} catch (e) {
		console.warn('tgSendMessage failed:', e instanceof Error ? e.message : e);
		return null;
	}
}


/** Edit ранее отправленного сообщения. Возвращает true при успехе. */
export async function tgEditMessageText(
	chatId: number, messageId: number, html: string,
): Promise<boolean> {
	if (!env.TELEGRAM_BOT_TOKEN) return false;
	const url = `${BOT_API}/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
	try {
		const r = await fetch(url, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				text: html,
				parse_mode: 'HTML',
				link_preview_options: {is_disabled: true},
			}),
		});
		if (!r.ok) {
			const body = await r.text().catch(() => '');
			// "message is not modified" — не ошибка, просто текст совпал.
			if (body.includes('message is not modified')) return true;
			console.warn(`tgEditMessageText non-2xx: ${r.status} ${body.slice(0, 200)}`);
			return false;
		}
		return true;
	} catch (e) {
		console.warn('tgEditMessageText failed:', e instanceof Error ? e.message : e);
		return false;
	}
}


/**
 * `pinChatMessage` — закрепляет сообщение в чате. Требует прав
 * `can_pin_messages` у бота (или `can_edit_messages` для каналов). Без
 * прав получим `400 Bad Request: not enough rights`. Возвращаем boolean
 * чтобы caller мог поведать пользователю.
 */
export async function tgPinChatMessage(chatId: number, messageId: number): Promise<boolean> {
	if (!env.TELEGRAM_BOT_TOKEN) return false;
	const url = `${BOT_API}/bot${env.TELEGRAM_BOT_TOKEN}/pinChatMessage`;
	try {
		const r = await fetch(url, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				disable_notification: true,
			}),
		});
		if (!r.ok) {
			const body = await r.text().catch(() => '');
			console.warn(`tgPinChatMessage non-2xx: ${r.status} ${body.slice(0, 200)}`);
			return false;
		}
		return true;
	} catch (e) {
		console.warn('tgPinChatMessage failed:', e instanceof Error ? e.message : e);
		return false;
	}
}


/**
 * `setMessageReaction` — добавить эмодзи-реакцию к сообщению (нашему же,
 * только что отправленному). Telegram-клиент рендерит её на сообщении
 * как акцент. Список валидных эмодзи описан в Bot API; используем
 * "сейфные" из топ-50 (🏆 👑 🔥 ⚡ ⭐).
 */
export async function tgSetMessageReaction(
	chatId: number, messageId: number, emoji: string,
): Promise<void> {
	if (!env.TELEGRAM_BOT_TOKEN) return;
	const url = `${BOT_API}/bot${env.TELEGRAM_BOT_TOKEN}/setMessageReaction`;
	try {
		await fetch(url, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				reaction: [{type: 'emoji', emoji}],
				is_big: false,
			}),
		});
	} catch (e) {
		console.warn('tgSetMessageReaction failed:', e instanceof Error ? e.message : e);
	}
}
