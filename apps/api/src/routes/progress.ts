import {Hono} from 'hono';
import {and, eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {
	MAX_LEVEL_NUMBER,
	MIN_LEVEL_TIME_MS,
	MAX_LEVEL_TIME_MS,
	STARS_MIN,
	STARS_MAX,
} from '@dead-spin/shared';
import {db} from '../db/client';
import {progresses, progressLevels} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest} from '../lib/errors';


export const progressRoutes = new Hono<AuthedEnv>();


/**
 * GET /progress — текущий прогресс игрока: сумма звёзд и рекорды по уровням.
 */
progressRoutes.get('/', requireAuth, async (c) => {
	const userId = c.var.user.id;

	const [summaryRow] = await db
		.select()
		.from(progresses)
		.where(eq(progresses.userId, userId))
		.limit(1);

	const levels = await db
		.select()
		.from(progressLevels)
		.where(eq(progressLevels.userId, userId));

	return c.json({
		summaryStars: summaryRow?.summaryStars ?? 0,
		levels,
	});
});


const LevelCompleteSchema = z.object({
	level: z.number().int().min(1).max(MAX_LEVEL_NUMBER),
	stars: z.number().int().min(STARS_MIN).max(STARS_MAX),
	timeMs: z.number().int().min(MIN_LEVEL_TIME_MS).max(MAX_LEVEL_TIME_MS),
	fuelSpent: z.number().int().min(0).max(1_000_000),
});


/**
 * POST /progress/level-complete
 * Принимает результат прохождения. Обновляет рекорд только если:
 *   - stars > существующего, либо
 *   - stars == существующего && timeMs < существующего
 * Не даёт пропустить уровни (кроме уровня 1).
 */
progressRoutes.post('/level-complete', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const raw = await c.req.json().catch(() => null);
	const parsed = LevelCompleteSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');

	const {level, stars, timeMs, fuelSpent} = parsed.data;

	const newStars = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(progressLevels)
			.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)))
			.limit(1);

		if (existing) {
			if (stars > existing.stars) {
				await tx.update(progressLevels)
					.set({stars, timeMs, fuelSpent, updatedAt: sql`now()`})
					.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)));
				return stars - existing.stars;
			}
			if (stars === existing.stars && timeMs < existing.timeMs) {
				await tx.update(progressLevels)
					.set({timeMs, fuelSpent, updatedAt: sql`now()`})
					.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)));
			}
			return 0;
		}

		// Нет рекорда по этому уровню — проверяем, что предыдущий пройден.
		if (level > 1) {
			const [prev] = await tx
				.select({level: progressLevels.level})
				.from(progressLevels)
				.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level - 1)))
				.limit(1);
			if (!prev) throw badRequest('previousLevelIncomplete');
		}

		await tx.insert(progressLevels).values({userId, level, stars, timeMs, fuelSpent});
		return stars;
	});

	if (newStars > 0) {
		await db.update(progresses)
			.set({
				summaryStars: sql`${progresses.summaryStars} + ${newStars}`,
				updatedAt: sql`now()`,
			})
			.where(eq(progresses.userId, userId));
	}

	return c.json({ok: true, newStars});
});
