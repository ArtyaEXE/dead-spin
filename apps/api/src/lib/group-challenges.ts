import {and, eq, gt, lt, or, sql} from 'drizzle-orm';
import type {GhostRecording} from '@dead-spin/shared';
import {db} from '../db/client';
import {groupChallenges, groupProgressLevels, users} from '../db/schema';
import {tgEditMessageText, tgSetMessageReaction} from './telegram-bot';
import {unlockAchievement} from './achievements';


/**
 * State machine челленджей. См. описание в schema.ts (groupChallenges).
 *
 * Главные триггеры:
 *  - bot/handlers/challenge.ts → createChallenge() — создаёт pending_accept.
 *  - bot/handlers/challenge.ts callback'и accept/decline/cancel → acceptChallenge / declineChallenge / cancelChallenge.
 *  - api/routes/progress.ts processGroupResult → onLevelCompleteForChallenge() — апдейтит лучший заход активного челленджа.
 *  - lazy expiry sweep вызывается на каждом из этих триггеров.
 */


export const ACCEPT_WINDOW_MS = 30 * 60 * 1000; // 30 минут на принятие
export const PLAY_WINDOW_MS = 60 * 60 * 1000;   // 1 час на игру после принятия


type ChallengeRow = typeof groupChallenges.$inferSelect;


function fmtTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/**
 * Сравнивает результаты двух игроков (больше звёзд > меньше времени).
 * +1 если a лучше, -1 если b лучше, 0 если равны.
 */
function compareResults(
	aStars: number, aTime: number,
	bStars: number, bTime: number,
): number {
	if (aStars !== bStars) return aStars > bStars ? 1 : -1;
	if (aTime !== bTime) return aTime < bTime ? 1 : -1;
	return 0;
}


async function getUsername(userId: string): Promise<string> {
	const [u] = await db.select({username: users.username})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return u?.username ?? 'unknown';
}


async function getUserDmMeta(userId: string): Promise<{tgId: string; locale: string} | null> {
	const [u] = await db.select({tgId: users.tgId, locale: users.locale})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!u) return null;
	return {tgId: u.tgId, locale: u.locale};
}


// ─── Тексты для бота (RU/EN) ─────────────────────────────────────────

function txtPosted(challenger: string, challengee: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `👊 <b>${escapeHtml(challenger)}</b> вызывает <b>${escapeHtml(challengee)}</b> на дуэль!\n\n` +
			`🎯 Уровень: <b>${level}</b> (выбран случайно)\n` +
			`⏳ Принять — <b>30 минут</b>. После принятия — <b>1 час</b> на любое количество попыток.\n` +
			`В зачёт идёт лучший заход.`;
	}
	return `👊 <b>${escapeHtml(challenger)}</b> challenges <b>${escapeHtml(challengee)}</b>!\n\n` +
		`🎯 Level: <b>${level}</b> (random)\n` +
		`⏳ <b>30 minutes</b> to accept. Once accepted — <b>1 hour</b> with unlimited attempts.\n` +
		`Best run counts.`;
}


function txtActive(challenger: string, challengee: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `⚔️ <b>Дуэль активна!</b>\n\n` +
			`<b>${escapeHtml(challenger)}</b> vs <b>${escapeHtml(challengee)}</b>\n` +
			`🎯 Уровень: <b>${level}</b>\n` +
			`⏳ Час на любое количество попыток. Лучший заход — в зачёт.`;
	}
	return `⚔️ <b>Duel is on!</b>\n\n` +
		`<b>${escapeHtml(challenger)}</b> vs <b>${escapeHtml(challengee)}</b>\n` +
		`🎯 Level: <b>${level}</b>\n` +
		`⏳ One hour, unlimited attempts. Best run counts.`;
}


function txtDeclined(challenger: string, challengee: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `✕ <b>${escapeHtml(challengee)}</b> отклонил вызов от <b>${escapeHtml(challenger)}</b> (уровень ${level}).`;
	}
	return `✕ <b>${escapeHtml(challengee)}</b> declined the duel from <b>${escapeHtml(challenger)}</b> (level ${level}).`;
}


function txtCancelled(challenger: string, challengee: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `⏎ <b>${escapeHtml(challenger)}</b> отменил дуэль с <b>${escapeHtml(challengee)}</b> (уровень ${level}).`;
	}
	return `⏎ <b>${escapeHtml(challenger)}</b> cancelled the duel with <b>${escapeHtml(challengee)}</b> (level ${level}).`;
}


function txtExpiredNoAccept(challenger: string, challengee: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `⏰ <b>${escapeHtml(challengee)}</b> не принял вызов от <b>${escapeHtml(challenger)}</b> за 30 минут (уровень ${level}).`;
	}
	return `⏰ <b>${escapeHtml(challengee)}</b> didn't accept ${escapeHtml(challenger)}'s duel within 30 minutes (level ${level}).`;
}


function txtExpiredNoPlay(challenger: string, challengee: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `⏰ Дуэль <b>${escapeHtml(challenger)}</b> vs <b>${escapeHtml(challengee)}</b> на уровне ${level} завершилась — никто не сыграл.`;
	}
	return `⏰ Duel <b>${escapeHtml(challenger)}</b> vs <b>${escapeHtml(challengee)}</b> on level ${level} ended — nobody played.`;
}


function txtResult(
	winner: string, loser: string, level: number,
	ws: number, wt: number, ls: number, lt: number, locale: 'ru' | 'en',
): string {
	if (locale === 'ru') {
		return `✅ <b>Дуэль на уровне ${level} завершена!</b>\n\n🏆 Победил <b>${escapeHtml(winner)}</b>: ${ws}⭐ <code>${fmtTime(wt)}</code>\n   <b>${escapeHtml(loser)}</b>: ${ls}⭐ <code>${fmtTime(lt)}</code>`;
	}
	return `✅ <b>Duel on level ${level} finished!</b>\n\n🏆 <b>${escapeHtml(winner)}</b> wins: ${ws}⭐ <code>${fmtTime(wt)}</code>\n   <b>${escapeHtml(loser)}</b>: ${ls}⭐ <code>${fmtTime(lt)}</code>`;
}


function txtOneSided(
	winner: string, loser: string, level: number, ws: number, wt: number, locale: 'ru' | 'en',
): string {
	if (locale === 'ru') {
		return `✅ <b>Дуэль на уровне ${level} завершена!</b>\n\n🏆 Победил <b>${escapeHtml(winner)}</b>: ${ws}⭐ <code>${fmtTime(wt)}</code> — <b>${escapeHtml(loser)}</b> так и не сыграл.`;
	}
	return `✅ <b>Duel on level ${level} finished!</b>\n\n🏆 <b>${escapeHtml(winner)}</b> wins: ${ws}⭐ <code>${fmtTime(wt)}</code> — <b>${escapeHtml(loser)}</b> didn't play.`;
}


function txtTie(a: string, b: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `🤝 Ничья на уровне ${level}: <b>${escapeHtml(a)}</b> и <b>${escapeHtml(b)}</b> — одинаковый счёт.`;
	}
	return `🤝 Tie on level ${level}: <b>${escapeHtml(a)}</b> and <b>${escapeHtml(b)}</b> — same score.`;
}


// ─── Public API ───────────────────────────────────────────────────────


/**
 * Есть ли у юзера активный или ожидающий принятия челлендж — в любом
 * чате. Используется ботом перед созданием нового, чтобы не плодить.
 */
export async function findActiveOrPending(userId: string): Promise<ChallengeRow | null> {
	const [row] = await db.select()
		.from(groupChallenges)
		.where(and(
			or(
				eq(groupChallenges.challengerUserId, userId),
				eq(groupChallenges.challengeeUserId, userId),
			),
			or(
				eq(groupChallenges.status, 'pending_accept'),
				eq(groupChallenges.status, 'active'),
			),
		))
		.limit(1);
	return row ?? null;
}


/**
 * Уровни, доступные обоим: пересечение `group_progress_levels` по chatId.
 * Возвращает массив номеров уровней. Пустой массив = пересечения нет.
 */
export async function commonLevels(chatId: number, userA: string, userB: string): Promise<number[]> {
	const rows = await db.execute<{level: number}>(sql`
		select a.level
		from group_progress_levels a
		inner join group_progress_levels b
		  on a.chat_id = b.chat_id and a.level = b.level
		where a.chat_id = ${chatId}
		  and a.user_id = ${userA}
		  and b.user_id = ${userB}
		group by a.level
		order by a.level
	`);
	return rows.map(r => r.level);
}


/**
 * Создание челленджа в pending_accept.
 * Caller'у даём только id + level — сообщение шлёт сам caller (бот),
 * потом обновляет messageId через `setMessageId`.
 */
export async function createChallenge(args: {
	chatId: number;
	challengerUserId: string;
	challengeeUserId: string;
	level: number;
}): Promise<{id: string}> {
	const expiresAt = new Date(Date.now() + ACCEPT_WINDOW_MS);
	const [row] = await db.insert(groupChallenges)
		.values({
			chatId: args.chatId,
			level: args.level,
			challengerUserId: args.challengerUserId,
			challengeeUserId: args.challengeeUserId,
			status: 'pending_accept',
			expiresAt,
		})
		.returning({id: groupChallenges.id});
	if (!row) throw new Error('createChallenge: insert returned nothing');
	return row;
}


export async function setMessageId(challengeId: string, messageId: number): Promise<void> {
	await db.update(groupChallenges)
		.set({messageId})
		.where(eq(groupChallenges.id, challengeId));
}


export async function getById(id: string): Promise<ChallengeRow | null> {
	const [row] = await db.select().from(groupChallenges).where(eq(groupChallenges.id, id)).limit(1);
	return row ?? null;
}


/**
 * Принятие челленджа оппонентом. Переводит pending_accept → active, ставит
 * accepted_at, пересчитывает expires_at = now + PLAY_WINDOW_MS.
 *
 * Возвращает обновлённую запись или null если что-то не так (не pending,
 * истёк, не существует). Caller (бот) edit'ит сообщение по результату.
 */
export async function acceptChallenge(args: {
	id: string;
	byUserId: string;
	locale: 'ru' | 'en';
}): Promise<{ok: true; row: ChallengeRow} | {ok: false; reason: 'notFound' | 'wrongUser' | 'wrongStatus' | 'expired'}> {
	const row = await getById(args.id);
	if (!row) return {ok: false, reason: 'notFound'};
	if (row.challengeeUserId !== args.byUserId) return {ok: false, reason: 'wrongUser'};
	if (row.status !== 'pending_accept') return {ok: false, reason: 'wrongStatus'};
	if (row.expiresAt.getTime() < Date.now()) return {ok: false, reason: 'expired'};

	const acceptedAt = new Date();
	const newExpiresAt = new Date(acceptedAt.getTime() + PLAY_WINDOW_MS);
	await db.update(groupChallenges)
		.set({status: 'active', acceptedAt, expiresAt: newExpiresAt})
		.where(eq(groupChallenges.id, args.id));

	const fresh = await getById(args.id);
	if (!fresh) return {ok: false, reason: 'notFound'};

	// Edit сообщения в активный статус.
	if (fresh.messageId !== null) {
		const challengerName = await getUsername(fresh.challengerUserId);
		const challengeeName = await getUsername(fresh.challengeeUserId);
		await tgEditMessageText(fresh.chatId, fresh.messageId, txtActive(challengerName, challengeeName, fresh.level, args.locale));
		await tgSetMessageReaction(fresh.chatId, fresh.messageId, '⚔️');
	}

	return {ok: true, row: fresh};
}


export async function declineChallenge(args: {
	id: string;
	byUserId: string;
	locale: 'ru' | 'en';
}): Promise<{ok: true} | {ok: false; reason: string}> {
	const row = await getById(args.id);
	if (!row) return {ok: false, reason: 'notFound'};
	if (row.challengeeUserId !== args.byUserId) return {ok: false, reason: 'wrongUser'};
	if (row.status !== 'pending_accept') return {ok: false, reason: 'wrongStatus'};

	await db.update(groupChallenges)
		.set({status: 'declined', resolvedAt: sql`now()`})
		.where(eq(groupChallenges.id, args.id));

	if (row.messageId !== null) {
		const challengerName = await getUsername(row.challengerUserId);
		const challengeeName = await getUsername(row.challengeeUserId);
		await tgEditMessageText(row.chatId, row.messageId, txtDeclined(challengerName, challengeeName, row.level, args.locale));
	}
	return {ok: true};
}


export async function cancelChallenge(args: {
	id: string;
	byUserId: string;
	locale: 'ru' | 'en';
}): Promise<{ok: true} | {ok: false; reason: string}> {
	const row = await getById(args.id);
	if (!row) return {ok: false, reason: 'notFound'};
	if (row.challengerUserId !== args.byUserId) return {ok: false, reason: 'wrongUser'};
	if (row.status !== 'pending_accept') return {ok: false, reason: 'wrongStatus'};

	await db.update(groupChallenges)
		.set({status: 'cancelled', resolvedAt: sql`now()`})
		.where(eq(groupChallenges.id, args.id));

	if (row.messageId !== null) {
		const challengerName = await getUsername(row.challengerUserId);
		const challengeeName = await getUsername(row.challengeeUserId);
		await tgEditMessageText(row.chatId, row.messageId, txtCancelled(challengerName, challengeeName, row.level, args.locale));
	}
	return {ok: true};
}


/**
 * Обработка level-complete внутри активного челленджа: апдейтит best
 * run для сыгравшей стороны. Сохраняет recording для ghost-замены.
 *
 * Если в момент level-complete активного челленджа на этом уровне нет —
 * no-op. Caller вызывает безусловно при group level-complete.
 */
export async function onLevelCompleteForChallenge(args: {
	chatId: number;
	userId: string;
	level: number;
	stars: number;
	timeMs: number;
	recording?: GhostRecording;
}): Promise<void> {
	const {chatId, userId, level, stars, timeMs, recording} = args;

	const [row] = await db.select()
		.from(groupChallenges)
		.where(and(
			eq(groupChallenges.chatId, chatId),
			eq(groupChallenges.level, level),
			eq(groupChallenges.status, 'active'),
			gt(groupChallenges.expiresAt, sql`now()`),
			or(
				eq(groupChallenges.challengerUserId, userId),
				eq(groupChallenges.challengeeUserId, userId),
			),
		))
		.limit(1);

	if (!row) return;

	const isChallenger = row.challengerUserId === userId;
	const curStars = isChallenger ? row.challengerStars : row.challengeeStars;
	const curTime = isChallenger ? row.challengerTimeMs : row.challengeeTimeMs;

	// Лучший заход — через compareResults. Если ещё нет результата вообще — пишем.
	const isFirstRun = curStars === null || curTime === null;
	const isBetter = !isFirstRun && compareResults(stars, timeMs, curStars!, curTime!) > 0;

	if (!isFirstRun && !isBetter) return;

	const updateFields = isChallenger
		? {challengerStars: stars, challengerTimeMs: timeMs, challengerRecording: recording ?? row.challengerRecording}
		: {challengeeStars: stars, challengeeTimeMs: timeMs, challengeeRecording: recording ?? row.challengeeRecording};

	await db.update(groupChallenges)
		.set(updateFields)
		.where(eq(groupChallenges.id, row.id));
}


/**
 * Лениво подметает истёкшие челленджи. Вызывается из триггеров (создание,
 * level-complete, accept/decline/cancel — всё может прокинуть expiry sweep).
 *
 * Сценарии:
 *  - pending_accept + expired → expired_no_accept (никто не нажал «принять»)
 *  - active + expired:
 *      - оба сыграли → completed с резолвом по compareResults
 *      - один сыграл → completed с one-sided победой
 *      - никто не сыграл → expired_no_play
 */
export async function sweepExpired(scope?: {chatId?: number}): Promise<void> {
	const filter = scope?.chatId !== undefined
		? and(eq(groupChallenges.chatId, scope.chatId), lt(groupChallenges.expiresAt, sql`now()`))
		: lt(groupChallenges.expiresAt, sql`now()`);

	const expired = await db.select()
		.from(groupChallenges)
		.where(and(
			or(eq(groupChallenges.status, 'pending_accept'), eq(groupChallenges.status, 'active')),
			filter,
		));

	for (const row of expired) {
		try {
			await finalizeExpired(row);
		} catch (e) {
			console.warn('finalizeExpired failed for', row.id, e instanceof Error ? e.message : e);
		}
	}
}


async function finalizeExpired(row: ChallengeRow): Promise<void> {
	const challengerMeta = await getUserDmMeta(row.challengerUserId);
	const challengeeMeta = await getUserDmMeta(row.challengeeUserId);
	const challengerName = await getUsername(row.challengerUserId);
	const challengeeName = await getUsername(row.challengeeUserId);
	// Локаль выбираем по тому, кто инициатор — это его челлендж по контексту.
	const locale: 'ru' | 'en' = (challengerMeta?.locale === 'ru') ? 'ru' : 'en';

	if (row.status === 'pending_accept') {
		// Никто не принял за 30 минут.
		await db.update(groupChallenges)
			.set({status: 'expired_no_accept', resolvedAt: sql`now()`})
			.where(eq(groupChallenges.id, row.id));
		if (row.messageId !== null) {
			await tgEditMessageText(row.chatId, row.messageId, txtExpiredNoAccept(challengerName, challengeeName, row.level, locale));
		}
		return;
	}

	// active + expired → нужен резолв.
	const aPlayed = row.challengerStars !== null && row.challengerTimeMs !== null;
	const bPlayed = row.challengeeStars !== null && row.challengeeTimeMs !== null;

	if (!aPlayed && !bPlayed) {
		await db.update(groupChallenges)
			.set({status: 'expired_no_play', resolvedAt: sql`now()`})
			.where(eq(groupChallenges.id, row.id));
		if (row.messageId !== null) {
			await tgEditMessageText(row.chatId, row.messageId, txtExpiredNoPlay(challengerName, challengeeName, row.level, locale));
		}
		return;
	}

	let html: string;
	let winnerUserId: string | null = null;

	if (aPlayed && bPlayed) {
		const cmp = compareResults(
			row.challengerStars!, row.challengerTimeMs!,
			row.challengeeStars!, row.challengeeTimeMs!,
		);
		if (cmp === 0) {
			html = txtTie(challengerName, challengeeName, row.level, locale);
		} else if (cmp > 0) {
			html = txtResult(challengerName, challengeeName, row.level,
				row.challengerStars!, row.challengerTimeMs!,
				row.challengeeStars!, row.challengeeTimeMs!, locale);
			winnerUserId = row.challengerUserId;
		} else {
			html = txtResult(challengeeName, challengerName, row.level,
				row.challengeeStars!, row.challengeeTimeMs!,
				row.challengerStars!, row.challengerTimeMs!, locale);
			winnerUserId = row.challengeeUserId;
		}
	} else if (aPlayed) {
		html = txtOneSided(challengerName, challengeeName, row.level,
			row.challengerStars!, row.challengerTimeMs!, locale);
		// One-sided победа — без `first_duel_win` (по spec'у).
	} else {
		html = txtOneSided(challengeeName, challengerName, row.level,
			row.challengeeStars!, row.challengeeTimeMs!, locale);
	}

	await db.update(groupChallenges)
		.set({status: 'completed', resolvedAt: sql`now()`})
		.where(eq(groupChallenges.id, row.id));

	if (row.messageId !== null) {
		await tgEditMessageText(row.chatId, row.messageId, html);
		await tgSetMessageReaction(row.chatId, row.messageId, '🏆');
	}

	if (winnerUserId !== null) {
		const meta = winnerUserId === row.challengerUserId ? challengerMeta : challengeeMeta;
		if (meta) {
			void unlockAchievement({
				userId: winnerUserId,
				key: 'first_duel_win',
				notify: true,
				tgId: meta.tgId,
				locale: meta.locale,
			});
		}
	}
}


/**
 * Активный или pending челлендж юзера для Mini App индикатора.
 * Возвращает чёрный ящик данных + recording оппонента (для ghost-замены).
 */
export async function getActiveForUser(userId: string): Promise<{
	id: string;
	chatId: number;
	level: number;
	status: 'pending_accept' | 'active';
	role: 'challenger' | 'challengee';
	opponentUserId: string;
	opponentUsername: string;
	expiresAt: Date;
	acceptedAt: Date | null;
	myStars: number | null;
	myTimeMs: number | null;
	opponentStars: number | null;
	opponentTimeMs: number | null;
	opponentRecording: GhostRecording | null;
} | null> {
	const row = await findActiveOrPending(userId);
	if (!row) return null;
	if (row.status !== 'pending_accept' && row.status !== 'active') return null;

	const isChallenger = row.challengerUserId === userId;
	const opponentId = isChallenger ? row.challengeeUserId : row.challengerUserId;
	const opponentUsername = await getUsername(opponentId);

	return {
		id: row.id,
		chatId: row.chatId,
		level: row.level,
		status: row.status as 'pending_accept' | 'active',
		role: isChallenger ? 'challenger' : 'challengee',
		opponentUserId: opponentId,
		opponentUsername,
		expiresAt: row.expiresAt,
		acceptedAt: row.acceptedAt,
		myStars: isChallenger ? row.challengerStars : row.challengeeStars,
		myTimeMs: isChallenger ? row.challengerTimeMs : row.challengeeTimeMs,
		opponentStars: isChallenger ? row.challengeeStars : row.challengerStars,
		opponentTimeMs: isChallenger ? row.challengeeTimeMs : row.challengerTimeMs,
		opponentRecording: ((isChallenger ? row.challengeeRecording : row.challengerRecording) as GhostRecording | null) ?? null,
	};
}
