import {Hono} from 'hono';
import {and, eq, isNull} from 'drizzle-orm';
import {GROUP_HMAC_LEN} from '@dead-spin/shared';
import {verifyGroupContext} from '@dead-spin/shared/group-hmac';
import {db} from '../db/client';
import {groupChats} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest, forbidden} from '../lib/errors';
import {env} from '../config';
import {isGroupMember} from '../lib/group-membership';


export const groupsRoutes = new Hono<AuthedEnv>();


/**
 * GET /groups/:chatId/info?hmac=<12hex>
 *
 * Метаданные беседы для Mini App: title, кастомный nickname (от
 * /setname) и эмодзи-аватар (от /setemoji). Mini App показывает плашку
 * вида «🚀 Команда Олега» — игрок понимает за какую беседу играет.
 *
 * Авторизация — стандартная: HMAC + членство в чате.
 */
groupsRoutes.get('/:chatId/info', requireAuth, async (c) => {
	const chatId = Number(c.req.param('chatId'));
	if (!Number.isInteger(chatId)) throw badRequest('invalidChatId');

	const hmac = c.req.query('hmac') ?? '';
	if (!new RegExp(`^[0-9a-f]{${GROUP_HMAC_LEN}}$`).test(hmac)) throw badRequest('invalidHmac');
	if (!verifyGroupContext(chatId, hmac, env.TELEGRAM_BOT_TOKEN)) throw forbidden('hmacMismatch');

	const [chat] = await db.select()
		.from(groupChats)
		.where(and(eq(groupChats.chatId, chatId), isNull(groupChats.leftAt)))
		.limit(1);
	if (!chat) throw forbidden('groupInactive');

	if (!await isGroupMember(chatId, c.var.user.tgId)) throw forbidden('notMember');

	return c.json({
		chatId: chat.chatId,
		title: chat.title,
		nickname: chat.nickname,
		emoji: chat.emoji,
	});
});
