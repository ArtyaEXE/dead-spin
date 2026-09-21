import {Hono} from 'hono';
import {and, eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {
	MAX_LEVEL_NUMBER,
	MIN_LEVEL_TIME_MS,
	MAX_LEVEL_TIME_MS,
	STARS_PER_LEVEL,
	computeRating,
	mergeRecord,
	GhostRecordingSchema,
} from '@dead-spin/shared';
import {getLevelByNumber, getPreviousLevelNumber} from '@dead-spin/levels';
import {db} from '../db/client';
import {progresses, progressLevels} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest} from '../lib/errors';
import {track} from '../lib/analytics';
import {upsertGlobalGhost} from '../lib/global-ghosts';

export const progressRoutes = new Hono<AuthedEnv>();

/**
 * GET /progress — текущий прогресс игрока: сумма звёзд и рекорды по уровням.
 */
progressRoutes.get('/', requireAuth, async (c) => {
	const userId = c.var.user.id;

	const [summaryRow] = await db.select().from(progresses).where(eq(progresses.userId, userId)).limit(1);

	const levels = await db.select().from(progressLevels).where(eq(progressLevels.userId, userId));

	return c.json({
		summaryStars: summaryRow?.summaryStars ?? 0,
		levels,
	});
});

const LevelCompleteSchema = z.object({
	level: z.number().int().min(1).max(MAX_LEVEL_NUMBER),
	// Сколько звёзд-предметов подобрано. Рейтинг (1..3★) сервер считает сам
	// по par-порогам уровня — клиенту его присылать нельзя.
	collected: z.number().int().min(0).max(STARS_PER_LEVEL),
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

	const {level, collected, timeMs, fuelSpent, recording} = parsed.data;

	// Уровень должен реально существовать в `@dead-spin/levels`. Без этой
	// проверки клиент мог бы отправить level=42 (несуществующий) и в БД
	// прилетал бы ghost-row, ломающий summary и UI. Это уже случилось с
	// бывшими L4-L15 — см. миграцию 0014_cleanup_ghost_levels.sql.
	const levelDef = getLevelByNumber(level);
	if (!levelDef) throw badRequest('unknownLevel');

	const rating = computeRating(levelDef, {collected, timeMs, fuelSpent});

	const newStars = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(progressLevels)
			.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)))
			.limit(1);

		if (existing) {
			// Флаги рейтинга липкие, время и топливо — минимумы (GDD §9,
			// mergeRecord): медленная зачистка не стирает лучшее время.
			const merged = mergeRecord(existing, {...rating, timeMs, fuelSpent});
			if (
				merged.stars !== existing.stars ||
				merged.timeMs !== existing.timeMs ||
				merged.fuelSpent !== existing.fuelSpent
			) {
				await tx
					.update(progressLevels)
					.set({
						stars: merged.stars,
						parHit: merged.parHit,
						fullClear: merged.fullClear,
						timeMs: merged.timeMs,
						fuelSpent: merged.fuelSpent,
						updatedAt: sql`now()`,
					})
					.where(and(eq(progressLevels.userId, userId), eq(progressLevels.level, level)));
			}
			return merged.stars - existing.stars;
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

		await tx.insert(progressLevels).values({
			userId,
			level,
			stars: rating.stars,
			parHit: rating.parHit,
			fullClear: rating.fullClear,
			timeMs,
			fuelSpent,
		});
		return rating.stars;
	});

	if (newStars > 0) {
		// Upsert — если строка ещё не создана (баг старой версии auth), вставляем
		// сразу с этим инкрементом; иначе атомарно обновляем существующую.
		await db
			.insert(progresses)
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
			level,
			collected,
			stars: rating.stars,
			par_hit: rating.parHit,
			full_clear: rating.fullClear,
			timeMs,
			fuelSpent,
			newStars,
			suspicious_fast: timeMs < MIN_LEVEL_TIME_MS,
		},
	});

	// Global ghost — fire-and-forget. Если текущий результат побил
	// абсолютный рекорд уровня — перезаписываем запись для single-mode ghost'а.
	void upsertGlobalGhost({userId, level, stars: rating.stars, timeMs, recording});

	return c.json({ok: true, newStars, stars: rating.stars, parHit: rating.parHit, fullClear: rating.fullClear});
});
