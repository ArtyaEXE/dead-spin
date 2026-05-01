import {and, eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {groupMembershipCache} from '../db/schema';
import {tgGetChatMemberStatus} from './telegram-bot';


const TTL_MS = 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);


/**
 * Проверка членства юзера в беседе. Дёргать `getChatMember` на каждый
 * `level-complete` дорого — кэшируем в `group_membership_cache` на 1 час.
 *
 * При cache miss или истёкшей записи: запрашиваем у Telegram, обновляем
 * запись. При временной ошибке Telegram (network) — возвращаем `false`,
 * чтобы не пропустить читера; пользователь повторит после пары минут.
 */
export async function isGroupMember(chatId: number, tgId: string): Promise<boolean> {
	const [cached] = await db.select()
		.from(groupMembershipCache)
		.where(and(eq(groupMembershipCache.chatId, chatId), eq(groupMembershipCache.tgId, tgId)))
		.limit(1);

	if (cached) {
		const ageMs = Date.now() - new Date(cached.checkedAt).getTime();
		if (ageMs < TTL_MS) return cached.isMember === 1;
	}

	const status = await tgGetChatMemberStatus(chatId, tgId);
	if (status === null) {
		// Telegram unreachable — отвечаем по последнему свежему кэшу, или false.
		return cached?.isMember === 1;
	}

	const isMember = ACTIVE_STATUSES.has(status);

	await db.insert(groupMembershipCache)
		.values({chatId, tgId, isMember: isMember ? 1 : 0})
		.onConflictDoUpdate({
			target: [groupMembershipCache.chatId, groupMembershipCache.tgId],
			set: {isMember: isMember ? 1 : 0, checkedAt: sql`now()`},
		});

	return isMember;
}
