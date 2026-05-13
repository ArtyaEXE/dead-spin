import {Hono} from 'hono';
import {z} from 'zod';
import {eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {progresses, progressLevels, groupProgressLevels, users, userGroupSkins, userGroupTutorials, groupChats} from '../db/schema';
import {badRequest, forbidden} from '../lib/errors';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {getDailyState, claimDaily} from '../lib/daily-rewards';
import {track} from '../lib/analytics';
import {ACHIEVEMENTS, listUserAchievements, type AchievementKey} from '../lib/achievements';
import {GROUP_HMAC_LEN} from '@dead-spin/shared';
import {verifyGroupContext} from '@dead-spin/shared/group-hmac';
import {env} from '../config';
import {isGroupMember} from '../lib/group-membership';
import {and, isNull} from 'drizzle-orm';


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
 * POST /me/skin — сохранить выбранный скин.
 *
 * Без groupChatId+groupHmac → DM-выбор, апдейт `users.selected_skin`.
 * С группой → per-chat выбор, upsert в `user_group_skins (user_id, chat_id)`.
 *
 * DM- и group-выборы независимы. Клиент при рендере проверяет контекст
 * (groupStore.chatId !== null → читает groupSelectedSkin, иначе user.selectedSkin),
 * и применяет fallback на prospector если в этом контексте звёзд не хватает.
 */
const SKIN_IDS = ['prospector', 'wanderer', 'engineer', 'veteran', 'asteroid-king'] as const;
const SetSkinSchema = z.object({
	skin: z.enum(SKIN_IDS),
	groupChatId: z.number().int().optional(),
	groupHmac: z.string().regex(new RegExp(`^[0-9a-f]{${GROUP_HMAC_LEN}}$`)).optional(),
});

meRoutes.post('/skin', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const tgId = c.var.user.tgId;
	const raw = await c.req.json().catch(() => null);
	const parsed = SetSkinSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');
	const {skin, groupChatId, groupHmac} = parsed.data;

	if (groupChatId !== undefined && groupHmac !== undefined) {
		// Per-chat выбор. HMAC + членство в чате — как и в других group-роутах.
		if (!verifyGroupContext(groupChatId, groupHmac, env.TELEGRAM_BOT_TOKEN)) throw forbidden('hmacMismatch');
		const [chat] = await db.select()
			.from(groupChats)
			.where(and(eq(groupChats.chatId, groupChatId), isNull(groupChats.leftAt)))
			.limit(1);
		if (!chat) throw forbidden('groupInactive');
		if (!await isGroupMember(groupChatId, tgId)) throw forbidden('notMember');

		await db.insert(userGroupSkins)
			.values({userId, chatId: groupChatId, selectedSkin: skin})
			.onConflictDoUpdate({
				target: [userGroupSkins.userId, userGroupSkins.chatId],
				set: {selectedSkin: skin, updatedAt: sql`now()`},
			});
		return c.json({groupSelectedSkin: skin});
	}

	// DM-выбор.
	await db.update(users)
		.set({selectedSkin: skin, updatedAt: sql`now()`})
		.where(eq(users.id, userId));
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	return c.json({user});
});


/**
 * POST /me/tutorial-seen — отметить просмотренный туториал.
 * Без groupChatId+groupHmac — пишем в DM-копию (users.seen_tutorials).
 * С группой — в per-chat (user_group_tutorials). Дубликаты не плодим:
 * если ключ уже в массиве — операция no-op.
 */
const TUTORIAL_KEYS = ['controls', 'mine', 'stone', 'worm'] as const;
const TutorialSeenSchema = z.object({
	key: z.enum(TUTORIAL_KEYS),
	groupChatId: z.number().int().optional(),
	groupHmac: z.string().regex(new RegExp(`^[0-9a-f]{${GROUP_HMAC_LEN}}$`)).optional(),
});

meRoutes.post('/tutorial-seen', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const tgId = c.var.user.tgId;
	const raw = await c.req.json().catch(() => null);
	const parsed = TutorialSeenSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');
	const {key, groupChatId, groupHmac} = parsed.data;

	if (groupChatId !== undefined && groupHmac !== undefined) {
		if (!verifyGroupContext(groupChatId, groupHmac, env.TELEGRAM_BOT_TOKEN)) throw forbidden('hmacMismatch');
		const [chat] = await db.select()
			.from(groupChats)
			.where(and(eq(groupChats.chatId, groupChatId), isNull(groupChats.leftAt)))
			.limit(1);
		if (!chat) throw forbidden('groupInactive');
		if (!await isGroupMember(groupChatId, tgId)) throw forbidden('notMember');

		// Upsert с дедупом массива: если key уже в seen_tutorials — no-op,
		// иначе append.
		await db.execute(sql`
			insert into user_group_tutorials (user_id, chat_id, seen_tutorials)
			values (${userId}, ${groupChatId}, array[${key}]::text[])
			on conflict (user_id, chat_id) do update
			set seen_tutorials = case
				when ${key} = any(user_group_tutorials.seen_tutorials) then user_group_tutorials.seen_tutorials
				else array_append(user_group_tutorials.seen_tutorials, ${key})
			end,
			updated_at = now()
		`);
		return c.json({ok: true});
	}

	// DM-выбор: апдейтим users.seen_tutorials с дедупом.
	await db.execute(sql`
		update users
		set seen_tutorials = case
			when ${key} = any(seen_tutorials) then seen_tutorials
			else array_append(seen_tutorials, ${key})
		end,
		updated_at = now()
		where id = ${userId}
	`);
	return c.json({ok: true});
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
		icon: ACHIEVEMENTS[key].icon,
		ru: ACHIEVEMENTS[key].ru,
		en: ACHIEVEMENTS[key].en,
		unlocked: unlockedKeys.has(key),
		unlockedAt: unlocked.find(u => u.key === key)?.unlockedAt ?? null,
	}));
	return c.json({achievements: list});
});
