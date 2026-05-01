import {Hono} from 'hono';
import {and, asc, desc, eq, isNull, sql} from 'drizzle-orm';
import {z} from 'zod';
import {MAX_LEVEL_NUMBER, GROUP_HMAC_LEN} from '@dead-spin/shared';
import {verifyGroupContext} from '@dead-spin/shared/group-hmac';
import {db} from '../db/client';
import {progressLevels, groupChats, groupProgressLevels, users} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest, forbidden} from '../lib/errors';
import {env} from '../config';
import {isGroupMember} from '../lib/group-membership';


export const leaderboardRoutes = new Hono<AuthedEnv>();


const LevelParam = z.object({
	level: z.coerce.number().int().min(1).max(MAX_LEVEL_NUMBER),
});
const QuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
});


/**
 * GET /leaderboard/:level?limit=20
 * Рейтинг по уровню: stars DESC, timeMs ASC.
 * Сейчас MVP — живой запрос к progress_levels с JOIN на users. При росте
 * нагрузки мигрируем на Redis sorted set, интерфейс эндпоинта не меняется.
 */
leaderboardRoutes.get('/:level', requireAuth, async (c) => {
	const params = LevelParam.safeParse({level: c.req.param('level')});
	if (!params.success) throw badRequest('invalidLevel');

	const query = QuerySchema.safeParse({limit: c.req.query('limit')});
	if (!query.success) throw badRequest('invalidLimit');

	const rows = await db
		.select({
			userId: progressLevels.userId,
			username: users.username,
			stars: progressLevels.stars,
			timeMs: progressLevels.timeMs,
			fuelSpent: progressLevels.fuelSpent,
			updatedAt: progressLevels.updatedAt,
		})
		.from(progressLevels)
		.innerJoin(users, eq(users.id, progressLevels.userId))
		.where(eq(progressLevels.level, params.data.level))
		.orderBy(desc(progressLevels.stars), asc(progressLevels.timeMs))
		.limit(query.data.limit);

	// Ранг текущего игрока — отдельным запросом (меньше данных в общей выборке).
	const [myRank] = await db.execute<{rank: number; stars: number; time_ms: number}>(sql`
		select rank, stars, time_ms from (
			select
				user_id,
				stars,
				time_ms,
				rank() over (order by stars desc, time_ms asc) as rank
			from progress_levels
			where level = ${params.data.level}
		) q
		where user_id = ${c.var.user.id}
	`);

	return c.json({
		level: params.data.level,
		entries: rows,
		me: myRank
			? {rank: Number(myRank.rank), stars: myRank.stars, timeMs: myRank.time_ms}
			: null,
	});
});


leaderboardRoutes.get('/', requireAuth, async (_c) => {
	throw badRequest('levelRequired');
});


const GroupParams = z.object({
	chatId: z.coerce.number().int(),
	level: z.coerce.number().int().min(1).max(MAX_LEVEL_NUMBER),
});


/**
 * GET /leaderboard/group/:chatId/:level?hmac=<12hex>&limit=20
 *
 * Лидерборд внутри одной беседы. Авторизация двухуровневая:
 *   1) HMAC chatId — гарантирует, что chatId выдан ботом
 *      (не подделан клиентом).
 *   2) `getChatMember` — гарантирует, что текущий юзер сейчас в беседе
 *      (или был там в последний час, см. кэш). Иначе можно прочитать
 *      чужой лидерборд по утёкшей deep-link.
 */
leaderboardRoutes.get('/group/:chatId/:level', requireAuth, async (c) => {
	const params = GroupParams.safeParse({chatId: c.req.param('chatId'), level: c.req.param('level')});
	if (!params.success) throw badRequest('invalidParams');

	const hmac = c.req.query('hmac') ?? '';
	if (!new RegExp(`^[0-9a-f]{${GROUP_HMAC_LEN}}$`).test(hmac)) throw badRequest('invalidHmac');
	if (!verifyGroupContext(params.data.chatId, hmac, env.TELEGRAM_BOT_TOKEN)) throw forbidden('hmacMismatch');

	// Беседа активна?
	const [chat] = await db.select()
		.from(groupChats)
		.where(and(eq(groupChats.chatId, params.data.chatId), isNull(groupChats.leftAt)))
		.limit(1);
	if (!chat) throw forbidden('groupInactive');

	if (!await isGroupMember(params.data.chatId, c.var.user.tgId)) {
		throw forbidden('notMember');
	}

	const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 20));

	const rows = await db
		.select({
			userId: groupProgressLevels.userId,
			username: users.username,
			stars: groupProgressLevels.stars,
			timeMs: groupProgressLevels.timeMs,
			fuelSpent: groupProgressLevels.fuelSpent,
			updatedAt: groupProgressLevels.updatedAt,
		})
		.from(groupProgressLevels)
		.innerJoin(users, eq(users.id, groupProgressLevels.userId))
		.where(and(
			eq(groupProgressLevels.chatId, params.data.chatId),
			eq(groupProgressLevels.level, params.data.level),
		))
		.orderBy(desc(groupProgressLevels.stars), asc(groupProgressLevels.timeMs))
		.limit(limit);

	const [myRank] = await db.execute<{rank: number; stars: number; time_ms: number}>(sql`
		select rank, stars, time_ms from (
			select
				user_id, stars, time_ms,
				rank() over (order by stars desc, time_ms asc) as rank
			from group_progress_levels
			where chat_id = ${params.data.chatId} and level = ${params.data.level}
		) q
		where user_id = ${c.var.user.id}
	`);

	return c.json({
		level: params.data.level,
		entries: rows,
		me: myRank
			? {rank: Number(myRank.rank), stars: myRank.stars, timeMs: myRank.time_ms}
			: null,
	});
});
