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
	GhostRecordingSchema,
	isPlausibleRecording,
	type GhostRecording,
} from '@dead-spin/shared';
import {getLevelByNumber} from '@dead-spin/levels';
import {verifyGroupContext} from '@dead-spin/shared/group-hmac';
import {db} from '../db/client';
import {progresses, progressLevels, groupChats, groupProgressLevels, groupGhosts, users} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest, forbidden} from '../lib/errors';
import {env} from '../config';
import {isGroupMember} from '../lib/group-membership';
import {sendGroupNotification, type GroupDiff} from '../lib/group-notifications';
import {ensurePinnedLeaderboard} from '../lib/group-pinned';
import {updateStreak, sendStreakNotification} from '../lib/group-streaks';
import {trackChallengeResultAndCollect} from '../lib/group-challenges';
import {track} from '../lib/analytics';
import {evaluateAchievementsAfterLevelComplete, unlockAchievement} from '../lib/achievements';


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


/**
 * GET /progress/group/:chatId?hmac=<12hex>
 *
 * Прогресс игрока В РАМКАХ беседы — отдельный от глобального. Когда игра
 * запущена через `/play` в группе, Mini App тянет именно этот эндпоинт,
 * чтобы лидерборд/уровни показывали состояние per-chat: уровни, ранее
 * пройденные глобально (в DM или в другой группе), считаются здесь
 * непройденными. Это "чистый старт" внутри беседы.
 *
 * Авторизация: HMAC + членство в чате (как в group leaderboard).
 */
progressRoutes.get('/group/:chatId', requireAuth, async (c) => {
	const chatId = Number(c.req.param('chatId'));
	if (!Number.isInteger(chatId)) throw badRequest('invalidChatId');

	const hmac = c.req.query('hmac') ?? '';
	if (!new RegExp(`^[0-9a-f]{${GROUP_HMAC_LEN}}$`).test(hmac)) throw badRequest('invalidHmac');
	if (!verifyGroupContext(chatId, hmac, env.TELEGRAM_BOT_TOKEN)) throw forbidden('hmacMismatch');

	const [chat] = await db.select()
		.from(groupChats)
		.where(and(eq(groupChats.chatId, chatId), isNull(groupChats.leftAt)))
		.limit(1);
	if (!chat) throw forbidden('groupInactive');

	if (!await isGroupMember(chatId, c.var.user.tgId)) throw forbidden('notMember');

	const userId = c.var.user.id;

	const rows = await db
		.select({
			userId: groupProgressLevels.userId,
			level: groupProgressLevels.level,
			stars: groupProgressLevels.stars,
			timeMs: groupProgressLevels.timeMs,
			fuelSpent: groupProgressLevels.fuelSpent,
			updatedAt: groupProgressLevels.updatedAt,
		})
		.from(groupProgressLevels)
		.where(and(
			eq(groupProgressLevels.chatId, chatId),
			eq(groupProgressLevels.userId, userId),
		));

	const summaryStars = rows.reduce((acc, r) => acc + r.stars, 0);

	return c.json({summaryStars, levels: rows});
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
	// Ghost-запись прохождения (event-based, см. shared/ghost.ts).
	// Принимается только в групповом контексте; сервер сохраняет только
	// запись текущего лидера (chat, level).
	recording: GhostRecordingSchema.optional(),
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

	const {level, stars, timeMs, fuelSpent, groupChatId, groupHmac, recording} = parsed.data;

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

	// Server-side трек — единственный надёжный (клиентский можно подделать).
	track({
		userId,
		event: 'level_complete',
		properties: {
			level, stars, timeMs, fuelSpent, newStars,
			in_group: groupChatId !== undefined,
		},
	});

	// Ачивки — fire-and-forget, чтобы Telegram-нотификации не задерживали ответ.
	void evaluateAchievementsAfterLevelComplete({
		userId, tgId, locale,
		level, stars, timeMs, fuelSpent,
	}).catch((e) => console.warn('evaluateAchievements failed:', e instanceof Error ? e.message : e));

	// Групповой контекст — ждём DB-write до ответа, чтобы клиентский
	// refresh после level-complete увидел свежую запись (без этого ловим
	// race: 200 уходит, group_progress_levels ещё не записан, refresh
	// возвращает старые данные → в Levels уровень "пропадает").
	// Внутри processGroupResult всё, что НЕ влияет на видимое клиентом
	// состояние (нотификации, pin, streaks, challenges), уже стартует
	// fire-and-forget.
	if (groupChatId !== undefined && groupHmac !== undefined) {
		await processGroupResult({
			chatId: groupChatId, hmac: groupHmac,
			userId, tgId, username, locale,
			level, stars, timeMs, fuelSpent,
			recording,
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
	recording?: GhostRecording;
}): Promise<void> {
	const {chatId, hmac, userId, tgId, username, locale, level, stars, timeMs, fuelSpent, recording} = args;

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
		// Прогресс в беседе — отдельный от глобального. Чтобы лидерборд
		// per chat начинался "с чистого листа", ставим тот же gate, что и
		// в глобальном пути: уровень N доступен только когда есть запись
		// о N-1 в этой беседе. На нарушении тихо выходим — глобальная
		// запись уже успешно сделана выше.
		if (level > 1) {
			const [prev] = await tx
				.select({level: groupProgressLevels.level})
				.from(groupProgressLevels)
				.where(and(
					eq(groupProgressLevels.chatId, chatId),
					eq(groupProgressLevels.userId, userId),
					eq(groupProgressLevels.level, level - 1),
				))
				.limit(1);
			if (!prev) {
				console.warn(`group prev-level gate: user ${userId} chat ${chatId} level ${level} skipped (no level ${level - 1})`);
				return null;
			}
		}

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

	// Ачивка «Социальный гонщик» — выдаётся при первой групповой записи.
	void unlockAchievement({userId, key: 'bot_in_group', notify: true, tgId, locale});

	// === Side-effects ===
	// До этой точки — главная DB-запись (group_progress_levels) уже
	// commitнута. Дальше идут "украшения" (нотификации, ghost storage,
	// streaks, challenges, pinned leaderboard) — они НЕ должны блокировать
	// ответ клиенту, потому что:
	//  - клиент сразу после 200 делает progressStore.refresh() и хочет
	//    увидеть свою новую запись;
	//  - Telegram API вызовы (sendMessage/setMessageReaction/editMessage)
	//    суммарно могут стоить 1-2 секунды; гнать клиента ждать — лишняя
	//    латентность.
	// Поэтому всё ниже — fire-and-forget внутри процесса. Логируем,
	// если что-то рухнуло.
	void runGroupSideEffects({
		chatId, userId, username, locale,
		level, stars, timeMs, recording, diff,
	}).catch((e) => console.warn('group side-effects failed:', e instanceof Error ? e.message : e));
}


async function runGroupSideEffects(args: {
	chatId: number;
	userId: string;
	username: string;
	locale: string;
	level: number;
	stars: number;
	timeMs: number;
	recording?: GhostRecording;
	diff: GroupDiff;
}): Promise<void> {
	const {chatId, userId, username, locale, level, stars, timeMs, recording, diff} = args;

	// Ghost: если этот результат сделал юзера лидером per (chat, level) —
	// перезаписываем сохранённую запись на новую (лучшую). Sanity-проверки
	// отсекают мусор от чита-клиента; падение проверок просто скипает ghost.
	if (recording && diff.newLeader.userId === userId) {
		const lvl = getLevelByNumber(level);
		const ok = lvl && isPlausibleRecording({
			rec: recording,
			level,
			startPoint: lvl.startPoint,
			finishPoint: lvl.finishPoint,
			timeMs,
		});
		if (ok) {
			await db.insert(groupGhosts)
				.values({chatId, level, userId, stars, timeMs, recording})
				.onConflictDoUpdate({
					target: [groupGhosts.chatId, groupGhosts.level],
					set: {userId, stars, timeMs, recording, recordedAt: sql`now()`},
				})
				.catch((e) => console.warn('group_ghosts upsert failed:', e instanceof Error ? e.message : e));
		} else {
			console.warn(`ghost recording rejected by sanity-check (chat=${chatId}, level=${level}, user=${userId})`);
		}
	}

	await sendGroupNotification({chatId, level, username, locale, diff});

	// Streak: считаем по календарным дням UTC. На новом milestone (3/7/14/30
	// и т.п.) шлём отдельное «🔥 N дней подряд». Best-effort.
	try {
		const {milestone} = await updateStreak({chatId, userId});
		if (milestone !== null) {
			await sendStreakNotification({chatId, username, days: milestone});
		}
	} catch (e) {
		console.warn('streak update failed:', e instanceof Error ? e.message : e);
	}

	// Дуэли: апдейтим счёт текущего юзера в активных challenges на этом
	// уровне в этом чате; если оба сыграли — финализируем + edit-сообщение.
	// Заодно подбираем истекшие pending-дуэли. Best-effort.
	try {
		await trackChallengeResultAndCollect({
			chatId, userId, level, stars, timeMs,
			locale: locale === 'ru' ? 'ru' : 'en',
		});
	} catch (e) {
		console.warn('trackChallengeResult failed:', e instanceof Error ? e.message : e);
	}

	// Обновляем закреплённый лидерборд беседы (отдельный pin'нутый сообщ
	// сам себя обновляет — все участники в шапке чата видят live-таблицу).
	// Best-effort: failure не валит запись прогресса.
	void ensurePinnedLeaderboard(chatId)
		.catch((e) => console.warn('ensurePinnedLeaderboard failed:', e instanceof Error ? e.message : e));
}
