/**
 * Утилиты разбора Telegram Mini App `start_param` для группового контекста.
 * Эти функции **чистые** (без node:crypto) — могут использоваться и в
 * браузере (Mini App). HMAC-подпись/проверка живёт в `./group-hmac` —
 * отдельный subpath с `node:crypto`, импортируется только серверным кодом.
 *
 * Формат start_param: `g_<chatId>_<hmac>` где
 *   chatId — Telegram chat_id (возможно отрицательный для групп);
 *   hmac   — 12 hex-символов (48 бит) от sha256(`group:<chatId>`, botToken).
 */


export const GROUP_HMAC_LEN = 12;


export type GroupStartParam = {
	kind: 'group';
	chatId: number;
	hmac: string;
};


export function makeGroupStartParam(chatId: number, hmac: string): string {
	return `g_${chatId}_${hmac}`;
}


export function parseGroupStartParam(raw: string | null | undefined): GroupStartParam | null {
	if (typeof raw !== 'string' || raw.length === 0) return null;
	const m = /^g_(-?\d+)_([0-9a-f]+)$/.exec(raw);
	if (!m) return null;
	const chatId = Number(m[1]);
	if (!Number.isInteger(chatId)) return null;
	const hmac = m[2]!;
	if (hmac.length !== GROUP_HMAC_LEN) return null;
	return {kind: 'group', chatId, hmac};
}
