/**
 * Решает, можно ли пропустить команду к handler'у в группе с настроенной
 * темой (play_thread_id). Чистая функция — БД достаём отдельно.
 *
 *   • Команда `/setplay` — всегда разрешена. Иначе админ, ошибившись с
 *     темой, не смог бы перенастроить (выходило бы в его же запрете).
 *   • Если в группе тема не настроена (configuredThread === null) —
 *     ограничения нет, бот работает везде. Это поведение по умолчанию
 *     для групп без forum-режима или групп где /setplay не вызывали.
 *   • Если тема настроена — пускаем только сообщения с тем же
 *     message_thread_id. General-топик (msgThread === null) считается
 *     отдельным — будет заблокирован, если play_thread_id ≠ null.
 */
export const ESCAPE_HATCH_COMMAND = 'setplay';


export function parseCommandName(rawText: string): string {
	const head = rawText.split(/\s/, 1)[0] ?? '';
	if (!head.startsWith('/')) return '';
	// Срезаем `/` и опциональный `@botname` суффикс.
	return head.slice(1).split('@')[0]!.toLowerCase();
}


export function isThreadAllowed(args: {
	configuredThread: number | null;
	msgThread: number | null;
	command: string;
}): boolean {
	if (args.command === ESCAPE_HATCH_COMMAND) return true;
	if (args.configuredThread === null) return true;
	return args.msgThread === args.configuredThread;
}
