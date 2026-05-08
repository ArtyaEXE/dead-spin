import {Hono} from 'hono';
import {eq} from 'drizzle-orm';
import {db} from '../db/client';
import {progresses, progressLevels, groupProgressLevels} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';


export const meRoutes = new Hono<AuthedEnv>();

meRoutes.get('/', requireAuth, (c) => {
	const user = c.var.user;
	return c.json({user});
});


/**
 * DELETE /me/progress — обнуление прогресса юзера. Сносит:
 *   - записи в progress_levels (глобальные рекорды по уровням)
 *   - запись в progresses (агрегат summaryStars)
 *   - все записи в group_progress_levels (per-chat рекорды во ВСЕХ беседах)
 *
 * Не трогает: user-row сам, fuel/coins, скины (они в localStorage).
 *
 * Используется тестерами через DM-команду `/reset` бота — если кто-то
 * залип в плохом состоянии, сбрасывает игру с нуля. Безопасно: юзер
 * может удалить только свои записи (auth-middleware проверяет).
 */
meRoutes.delete('/progress', requireAuth, async (c) => {
	const userId = c.var.user.id;
	await db.transaction(async (tx) => {
		await tx.delete(progressLevels).where(eq(progressLevels.userId, userId));
		await tx.delete(progresses).where(eq(progresses.userId, userId));
		await tx.delete(groupProgressLevels).where(eq(groupProgressLevels.userId, userId));
	});
	return c.json({ok: true});
});
