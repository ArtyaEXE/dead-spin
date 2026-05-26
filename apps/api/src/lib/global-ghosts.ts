import {eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {globalGhosts, progressLevels, users} from '../db/schema';
import type {GhostRecording} from '@dead-spin/shared';


/**
 * Обновляет global ghost, если текущий результат — новый абсолютный рекорд
 * (stars DESC, timeMs ASC). Вызывается из level-complete после записи
 * в progress_levels.
 *
 * Логика: сравниваем с текущим global leader на этом уровне. Если текущий
 * результат лучше (или ghost'а ещё нет) — upsert. Иначе — noop.
 *
 * Fire-and-forget: ошибки логируем, не пробрасываем.
 */
export async function upsertGlobalGhost(args: {
	userId: string;
	level: number;
	stars: number;
	timeMs: number;
	recording: GhostRecording | undefined;
}): Promise<void> {
	if (!args.recording) return;

	try {
		const [current] = await db
			.select({stars: globalGhosts.stars, timeMs: globalGhosts.timeMs})
			.from(globalGhosts)
			.where(eq(globalGhosts.level, args.level))
			.limit(1);

		const isBetter = !current
			|| args.stars > current.stars
			|| (args.stars === current.stars && args.timeMs < current.timeMs);

		if (!isBetter) return;

		await db.insert(globalGhosts)
			.values({
				level: args.level,
				userId: args.userId,
				stars: args.stars,
				timeMs: args.timeMs,
				recording: args.recording,
				recordedAt: sql`now()`,
			})
			.onConflictDoUpdate({
				target: globalGhosts.level,
				set: {
					userId: args.userId,
					stars: args.stars,
					timeMs: args.timeMs,
					recording: args.recording,
					recordedAt: sql`now()`,
				},
			});
	} catch (e) {
		console.warn('upsertGlobalGhost failed:', e instanceof Error ? e.message : e);
	}
}
