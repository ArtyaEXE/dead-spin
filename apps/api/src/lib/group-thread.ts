import {eq} from 'drizzle-orm';
import {db} from '../db/client';
import {groupChats} from '../db/schema';


/**
 * Возвращает `play_thread_id` беседы — куда бот шлёт level-clear,
 * streak-milestones и pinned LB. NULL = General (тем нет или админ
 * не настраивал через `/setplay`).
 *
 * Best-effort: при ошибке возвращаем null, чтобы нотификация всё
 * равно ушла в General — пользовательский UX важнее точного роутинга.
 */
export async function getPlayThreadId(chatId: number): Promise<number | null> {
	try {
		const [row] = await db
			.select({threadId: groupChats.playThreadId})
			.from(groupChats)
			.where(eq(groupChats.chatId, chatId))
			.limit(1);
		return row?.threadId ?? null;
	} catch (e) {
		console.warn('getPlayThreadId failed:', e instanceof Error ? e.message : e);
		return null;
	}
}
