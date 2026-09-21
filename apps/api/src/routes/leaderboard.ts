import {Hono} from 'hono';
import {asc, desc, eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {MAX_LEVEL_NUMBER} from '@dead-spin/shared';
import {db} from '../db/client';
import {progressLevels, globalGhosts, users} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest, notFound} from '../lib/errors';

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
		me: myRank ? {rank: Number(myRank.rank), stars: myRank.stars, timeMs: myRank.time_ms} : null,
	});
});

leaderboardRoutes.get('/', requireAuth, async (_c) => {
	throw badRequest('levelRequired');
});

/**
 * GET /leaderboard/:level/ghost
 *
 * Ghost-запись глобального лидера уровня — для single-режима. Без HMAC,
 * авторизация только JWT. 404 если ghost ещё не записан.
 */
leaderboardRoutes.get('/:level/ghost', requireAuth, async (c) => {
	const params = LevelParam.safeParse({level: c.req.param('level')});
	if (!params.success) throw badRequest('invalidLevel');

	const [row] = await db
		.select({
			userId: globalGhosts.userId,
			username: users.username,
			stars: globalGhosts.stars,
			timeMs: globalGhosts.timeMs,
			recording: globalGhosts.recording,
			recordedAt: globalGhosts.recordedAt,
		})
		.from(globalGhosts)
		.innerJoin(users, eq(users.id, globalGhosts.userId))
		.where(eq(globalGhosts.level, params.data.level))
		.limit(1);

	if (!row) throw notFound('noGhost');

	return c.json({
		level: params.data.level,
		userId: row.userId,
		username: row.username,
		stars: row.stars,
		timeMs: row.timeMs,
		recording: row.recording,
		recordedAt: row.recordedAt,
	});
});
