import {Hono} from 'hono';
import {and, asc, desc, eq, isNull, sql} from 'drizzle-orm';
import {z} from 'zod';
import {
	MAX_LEVEL_NUMBER,
	MIN_LEVEL_TIME_MS,
	MAX_LEVEL_TIME_MS,
	STARS_MIN,
	STARS_MAX,
	GhostRecordingSchema,
	isPlausibleRecording,
	type GhostRecording,
} from '@dead-spin/shared';
import {getLevelByNumber, getPreviousLevelNumber} from '@dead-spin/levels';
import {db} from '../db/client';
import {progresses, progressLevels} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest} from '../lib/errors';
import {track} from '../lib/analytics';
import {evaluateAchievementsAfterLevelComplete} from '../lib/achievements';
import {upsertGlobalGhost} from '../lib/global-ghosts';


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
	// Нижней границы нет: клир быстрее MIN_LEVEL_TIME_MS — не ошибка, а
	// аномалия, которую помечаем в аналитике. Раньше он отбрасывался с 400,
	// и лучшие игроки теряли результат.
	timeMs: z.number().int().min(1).max(MAX_LEVEL_TIME_MS),
	fuelSpent: z.number().int().min(0).max(1_000_000),
	// Ghost-запись прохождения (event-based, см. shared/ghost.ts).
	// Сервер сохраняет её, если побит глобальный рекорд уровня.
	recording: GhostRecordingSchema.optional(),
});


/**
 * POST /progress/level-complete
 *
 * Обновляет глобальный рекорд (progress_levels) и агрегат звёзд.
 */
progressRoutes.post('/level-complete', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const raw = await c.req.json().catch(() => null);
	const parsed = LevelCompleteSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');

	const {level, stars, timeMs, fuelSpent, recording} = parsed.data;

	// Уровень должен реально существовать в `@dead-spin/levels`. Без этой
	// проверки клиент мог бы отправить level=42 (несуществующий) и в БД
	// прилетал бы ghost-row, ломающий summary и UI. Это уже случилось с
	// бывшими L4-L15 — см. миграцию 0014_cleanup_ghost_levels.sql.
	if (!getLevelByNumber(level)) throw badRequest('unknownLevel');


	const newStars = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(progressLevels)
			.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)))
			.limit(1);

		if (existing) {
			// Три показателя улучшаются независимо (см. GDD §9): рост звёзд не
			// должен стирать лучшее время, а быстрый заход — терять звёзды.
			const bestStars = Math.max(existing.stars, stars);
			const bestTime = Math.min(existing.timeMs, timeMs);
			const bestFuel = Math.min(existing.fuelSpent, fuelSpent);
			if (bestStars !== existing.stars || bestTime !== existing.timeMs || bestFuel !== existing.fuelSpent) {
				await tx.update(progressLevels)
					.set({stars: bestStars, timeMs: bestTime, fuelSpent: bestFuel, updatedAt: sql`now()`})
					.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)));
			}
			return bestStars - existing.stars;
		}

		// Нет рекорда по этому уровню — проверяем, что предыдущий пройден.
		// «Предыдущий» — ближайший СУЩЕСТВУЮЩИЙ уровень с меньшим номером
		// (миры разделены дыркой 4-15: после L3 идёт сразу L16, см.
		// packages/levels/src/index.ts). Без `getPreviousLevelNumber()`
		// gate ломался бы для PALLAS-уровней, потому что искал бы L15
		// в progressLevels, а такого уровня в data/ нет.
		const prevNum = getPreviousLevelNumber(level);
		if (prevNum !== null) {
			const [prev] = await tx
				.select({level: progressLevels.level})
				.from(progressLevels)
				.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, prevNum)))
				.limit(1);
			if (!prev) throw badRequest('previousLevelIncomplete');
		}

		await tx.insert(progressLevels).values({userId, level, stars, timeMs, fuelSpent});
		return stars;
	});

	if (newStars > 0) {
		// Upsert — если строка ещё не создана (баг старой версии auth), вставляем
		// сразу с этим инкрементом; иначе атомарно обновляем существующую.
		await db.insert(progresses)
			.values({userId, summaryStars: newStars})
			.onConflictDoUpdate({
				target: progresses.userId,
				set: {
					summaryStars: sql`${progresses.summaryStars} + ${newStars}`,
					updatedAt: sql`now()`,
				},
			});
	}

	// Server-side трек — единственный надёжный (клиентский можно подделать).
	track({
		userId,
		event: 'level_complete',
		properties: {
			level, stars, timeMs, fuelSpent, newStars,
			suspicious_fast: timeMs < MIN_LEVEL_TIME_MS,
		},
	});

	// Ачивки — fire-and-forget, чтобы не задерживать ответ.
	void evaluateAchievementsAfterLevelComplete({
		userId,
		level, stars, timeMs, fuelSpent,
	}).catch((e) => console.warn('evaluateAchievements failed:', e instanceof Error ? e.message : e));

	// Global ghost — fire-and-forget. Если текущий результат побил
	// абсолютный рекорд уровня — перезаписываем запись для single-mode ghost'а.
	void upsertGlobalGhost({userId, level, stars, timeMs, recording});

	return c.json({ok: true, newStars});
});

