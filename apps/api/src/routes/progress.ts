import {Hono} from 'hono';
import {and, asc, desc, eq, isNull, sql} from 'drizzle-orm';
import {z} from 'zod';
import {
	MAX_LEVEL_NUMBER,
	MIN_LEVEL_TIME_MS,
	MAX_LEVEL_TIME_MS,
	STARS_MIN,
	STARS_MAX,
	GROUP_HMAC_LEN,
} from '@dead-spin/shared';
import {verifyGroupContext} from '@dead-spin/shared/group-hmac';
import {db} from '../db/client';
import {progresses, progressLevels, groupChats, groupProgressLevels, users} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest} from '../lib/errors';
import {env} from '../config';
import {isGroupMember} from '../lib/group-membership';
import {sendGroupNotification, type GroupDiff} from '../lib/group-notifications';


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
	// Опционально: групповой контекст. Шлётся Mini App'ом, если игра
	// открыта через `/play` в беседе. Игнорируем, если HMAC не сходится
	// или юзер не участник беседы — глобальный прогресс при этом
	// записывается как обычно.
	groupChatId: z.number().int().optional(),
	groupHmac: z.string().regex(new RegExp(`^[0-9a-f]{${GROUP_HMAC_LEN}}$`)).optional(),
});


/**
 * POST /progress/level-complete
 *
 * Обновляет глобальный рекорд (progress_levels). Если приходит групповой
 * контекст — дополнительно пишет в group_progress_levels (если результат
 * лучше) и отправляет нотификацию в беседу.
 *
 * Группой write — best-effort, не валит запрос при ошибках Telegram API
 * или подделанном HMAC. Глобальная запись приоритетна.
 */
progressRoutes.post('/level-complete', requireAuth, async (c) => {
	const userId = c.var.user.id;
	const tgId = c.var.user.tgId;
	const username = c.var.user.username;
	const locale = c.var.user.locale;
	const raw = await c.req.json().catch(() => null);
	const parsed = LevelCompleteSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');

	const {level, stars, timeMs, fuelSpent, groupChatId, groupHmac} = parsed.data;

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

	// Групповой write + нотификация — отдельным шагом, не блокирует ответ.
	if (groupChatId !== undefined && groupHmac !== undefined) {
		void processGroupResult({
			chatId: groupChatId, hmac: groupHmac,
			userId, tgId, username, locale,
			level, stars, timeMs, fuelSpent,
		}).catch((e) => console.warn('processGroupResult failed:', e instanceof Error ? e.message : e));
	}

	return c.json({ok: true, newStars});
});


/**
 * Группой write — извлечён, чтобы 1) не раздувать обработчик роута и
 * 2) запускать вне основного транзакционного потока (чтобы failure не
 * откатывал глобальную запись).
 */
async function processGroupResult(args: {
	chatId: number;
	hmac: string;
	userId: string;
	tgId: string;
	username: string;
	locale: string;
	level: number;
	stars: number;
	timeMs: number;
	fuelSpent: number;
}): Promise<void> {
	const {chatId, hmac, userId, tgId, username, locale, level, stars, timeMs, fuelSpent} = args;

	if (!verifyGroupContext(chatId, hmac, env.TELEGRAM_BOT_TOKEN)) {
		console.warn(`group HMAC mismatch for chat ${chatId} user ${userId}`);
		return;
	}

	// Беседа должна быть зарегистрирована и активна (бот в ней).
	const [chat] = await db.select()
		.from(groupChats)
		.where(and(eq(groupChats.chatId, chatId), isNull(groupChats.leftAt)))
		.limit(1);
	if (!chat) {
		console.warn(`group chat ${chatId} not registered or bot left`);
		return;
	}

	if (!await isGroupMember(chatId, tgId)) {
		console.warn(`user ${tgId} not member of chat ${chatId}`);
		return;
	}

	const diff = await db.transaction(async (tx): Promise<GroupDiff | null> => {
		// Лидер до апдейта.
		const oldLeaderRows = await tx
			.select({userId: groupProgressLevels.userId, username: users.username})
			.from(groupProgressLevels)
			.innerJoin(users, eq(users.id, groupProgressLevels.userId))
			.where(and(
				eq(groupProgressLevels.chatId, chatId),
				eq(groupProgressLevels.level, level),
			))
			.orderBy(desc(groupProgressLevels.stars), asc(groupProgressLevels.timeMs))
			.limit(1);
		const oldLeader = oldLeaderRows[0] ?? null;

		// Личный рекорд этого юзера в этой беседе.
		const [oldRec] = await tx.select()
			.from(groupProgressLevels)
			.where(and(
				eq(groupProgressLevels.chatId, chatId),
				eq(groupProgressLevels.userId, userId),
				eq(groupProgressLevels.level, level),
			))
			.limit(1);

		let wrote = false;
		let starsImproved = false;
		let timeImproved = false;

		if (!oldRec) {
			await tx.insert(groupProgressLevels)
				.values({chatId, userId, level, stars, timeMs, fuelSpent});
			wrote = true;
		} else if (stars > oldRec.stars) {
			await tx.update(groupProgressLevels)
				.set({stars, timeMs, fuelSpent, updatedAt: sql`now()`})
				.where(and(
					eq(groupProgressLevels.chatId, chatId),
					eq(groupProgressLevels.userId, userId),
					eq(groupProgressLevels.level, level),
				));
			wrote = true; starsImproved = true;
		} else if (stars === oldRec.stars && timeMs < oldRec.timeMs) {
			await tx.update(groupProgressLevels)
				.set({timeMs, fuelSpent, updatedAt: sql`now()`})
				.where(and(
					eq(groupProgressLevels.chatId, chatId),
					eq(groupProgressLevels.userId, userId),
					eq(groupProgressLevels.level, level),
				));
			wrote = true; timeImproved = true;
		}

		if (!wrote) return null;

		// Лидер после апдейта.
		const newLeaderRows = await tx
			.select({userId: groupProgressLevels.userId, username: users.username})
			.from(groupProgressLevels)
			.innerJoin(users, eq(users.id, groupProgressLevels.userId))
			.where(and(
				eq(groupProgressLevels.chatId, chatId),
				eq(groupProgressLevels.level, level),
			))
			.orderBy(desc(groupProgressLevels.stars), asc(groupProgressLevels.timeMs))
			.limit(1);
		const newLeader = newLeaderRows[0];
		if (!newLeader) return null; // не должно случиться, мы только что записали

		const leaderChanged = !oldLeader || oldLeader.userId !== newLeader.userId;

		return {
			isFirstClear: !oldRec,
			starsImproved,
			timeImproved,
			newStars: stars,
			newTimeMs: timeMs,
			oldLeader,
			newLeader,
			leaderChanged,
		};
	});

	if (!diff) return;

	await sendGroupNotification({chatId, level, username, locale, diff});
}
