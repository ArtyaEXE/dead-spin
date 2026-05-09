import {Hono} from 'hono';
import {z} from 'zod';
import {eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {progresses, progressLevels, groupProgressLevels, users} from '../db/schema';
import {badRequest} from '../lib/errors';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {getDailyState, claimDaily} from '../lib/daily-rewards';
import {track} from '../lib/analytics';
import {ACHIEVEMENTS, listUserAchievements, type AchievementKey} from '../lib/achievements';


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


/**
 * GET /me/daily — состояние дневного бонуса (для UI: показывать кнопку
 * «забрать» или «уже сегодня собрал»; превью следующей награды).
 */
meRoutes.get('/daily', requireAuth, async (c) => {
	const state = await getDailyState(c.var.user.id);
	return c.json(state);
});


/**
 * POST /me/daily — забрать сегодняшний бонус. Идемпотентно: повторный
 * вызов в тот же день вернёт {claimed: false, reason: 'alreadyClaimed'}.
 * После успеха возвращает свежий user-объект (с обновлённым fuel/coins).
 */
meRoutes.post('/daily', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const result = await claimDaily(userId);

	if (result.claimed) {
		track({
			userId,
			event: 'daily_checkin',
			properties: {streak: result.streakDays, fuel: result.reward.fuel, coins: result.reward.coins},
		});
	}

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	return c.json({...result, user});
});


const SpendCoinsSchema = z.object({
	amount: z.number().int().min(1).max(10_000),
	reason: z.string().min(1).max(50),
});


/**
 * POST /me/spend-coins — списать монеты на конкретный «item». Проверка
 * атомарной достаточности баланса через WHERE coins >= amount.
 *
 * Сейчас единственный reason — `skip_low_fuel` (50 coins, чтобы зайти
 * на уровень с недостаточным топливом). Расширяется по мере появления
 * товаров.
 */
meRoutes.post('/spend-coins', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const raw = await c.req.json().catch(() => null);
	const parsed = SpendCoinsSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');
	const {amount, reason} = parsed.data;

	const updated = await db.update(users)
		.set({coins: sql`coins - ${amount}`, updatedAt: sql`now()`})
		.where(sql`${users.id} = ${userId} and ${users.coins} >= ${amount}`)
		.returning({coins: users.coins});

	if (updated.length === 0) throw badRequest('notEnoughCoins');

	track({userId, event: 'coins_spent', properties: {amount, reason}});
	return c.json({ok: true, coins: updated[0]!.coins});
});


/**
 * GET /me/achievements — список ключей разблокированных ачивок + meta
 * (emoji + локализованные названия) для UI-плашки.
 */
meRoutes.get('/achievements', requireAuth, async (c) => {
	const unlocked = await listUserAchievements(c.var.user.id);
	const unlockedKeys = new Set(unlocked.map(u => u.key));
	const list = (Object.keys(ACHIEVEMENTS) as AchievementKey[]).map((key) => ({
		key,
		emoji: ACHIEVEMENTS[key].emoji,
		ru: ACHIEVEMENTS[key].ru,
		en: ACHIEVEMENTS[key].en,
		unlocked: unlockedKeys.has(key),
		unlockedAt: unlocked.find(u => u.key === key)?.unlockedAt ?? null,
	}));
	return c.json({achievements: list});
});
