import {and, eq, gt, lt, or, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {groupChallenges, users} from '../db/schema';
import {tgEditMessageText, tgSendMessage, tgSetMessageReaction} from './telegram-bot';


/**
 * Резолвер дуэлей. Вызывается:
 *  - при каждом успешном group-write (см. processGroupResult) —
 *    обновляем счёт участника, проверяем "оба сыграли".
 *  - лениво из тех же триггеров — резолвим истёкшие pending-дуэли
 *    с одним сыгравшим как победу по дефолту.
 *
 * Резолв = edit того же сообщения с итогом и реакция 🏆.
 */


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
 * Возвращает +1 если a лучше, -1 если b лучше, 0 если равны.
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


/**
 * Финализирует дуэль: edit сообщения с итогом, статус='completed'/'expired'.
 * `expired` — когда хотя бы один не сыграл (oneSided / nobody played).
 */
async function finalize(ch: ChallengeRow, locale: 'ru' | 'en'): Promise<void> {
	const challengerName = await getUsername(ch.challengerUserId);
	const challengeeName = await getUsername(ch.challengeeUserId);

	const aPlayed = ch.challengerStars !== null && ch.challengerTimeMs !== null;
	const bPlayed = ch.challengeeStars !== null && ch.challengeeTimeMs !== null;

	let html: string | null = null;
	let isExpired = false;

	if (aPlayed && bPlayed) {
		const cmp = compareResults(
			ch.challengerStars!, ch.challengerTimeMs!,
			ch.challengeeStars!, ch.challengeeTimeMs!,
		);
		if (cmp === 0) {
			html = textTie(challengerName, challengeeName, ch.level, locale);
		} else if (cmp > 0) {
			html = textResult(challengerName, challengeeName, ch.level,
				ch.challengerStars!, ch.challengerTimeMs!,
				ch.challengeeStars!, ch.challengeeTimeMs!,
				locale,
			);
		} else {
			html = textResult(challengeeName, challengerName, ch.level,
				ch.challengeeStars!, ch.challengeeTimeMs!,
				ch.challengerStars!, ch.challengerTimeMs!,
				locale,
			);
		}
	} else if (aPlayed) {
		html = textOneSided(challengerName, challengeeName, ch.level,
			ch.challengerStars!, ch.challengerTimeMs!, locale);
		isExpired = true;
	} else if (bPlayed) {
		html = textOneSided(challengeeName, challengerName, ch.level,
			ch.challengeeStars!, ch.challengeeTimeMs!, locale);
		isExpired = true;
	} else {
		// никто не сыграл — тихо expired без сообщения
		isExpired = true;
	}

	if (html && ch.messageId !== null) {
		const ok = await tgEditMessageText(ch.chatId, ch.messageId, html);
		if (ok) await tgSetMessageReaction(ch.chatId, ch.messageId, '🏆');
	}

	await db.update(groupChallenges)
		.set({
			status: isExpired ? 'expired' : 'completed',
			resolvedAt: sql`now()`,
		})
		.where(eq(groupChallenges.id, ch.id));
}


function textResult(
	winner: string, loser: string, level: number,
	ws: number, wt: number, ls: number, lt: number, locale: 'ru' | 'en',
): string {
	if (locale === 'ru') {
		return `✅ <b>Дуэль на уровне ${level} завершена!</b>\n\n🏆 Победил <b>${escapeHtml(winner)}</b>: ${ws}⭐ <code>${fmtTime(wt)}</code>\n   <b>${escapeHtml(loser)}</b>: ${ls}⭐ <code>${fmtTime(lt)}</code>`;
	}
	return `✅ <b>Duel on level ${level} finished!</b>\n\n🏆 <b>${escapeHtml(winner)}</b> wins: ${ws}⭐ <code>${fmtTime(wt)}</code>\n   <b>${escapeHtml(loser)}</b>: ${ls}⭐ <code>${fmtTime(lt)}</code>`;
}


function textOneSided(
	winner: string, loser: string, level: number, ws: number, wt: number, locale: 'ru' | 'en',
): string {
	if (locale === 'ru') {
		return `⏰ <b>Время вышло.</b>\n\n🏆 На уровне ${level} победил <b>${escapeHtml(winner)}</b> ${ws}⭐ <code>${fmtTime(wt)}</code> — <b>${escapeHtml(loser)}</b> так и не сыграл.`;
	}
	return `⏰ <b>Time's up.</b>\n\n🏆 On level ${level} <b>${escapeHtml(winner)}</b> wins ${ws}⭐ <code>${fmtTime(wt)}</code> — <b>${escapeHtml(loser)}</b> didn't play.`;
}


function textTie(a: string, b: string, level: number, locale: 'ru' | 'en'): string {
	if (locale === 'ru') {
		return `🤝 Ничья на уровне ${level}: <b>${escapeHtml(a)}</b> и <b>${escapeHtml(b)}</b> — одинаковый счёт.`;
	}
	return `🤝 Tie on level ${level}: <b>${escapeHtml(a)}</b> and <b>${escapeHtml(b)}</b> — same score.`;
}


/**
 * Промежуточное «X сыграл, ход за Y». Отдельным сообщением, чтобы оппонент
 * увидел push в чате — можно было пойти попробовать ответный заход.
 */
async function sendIntermediateUpdate(
	ch: ChallengeRow,
	isChallenger: boolean,
	stars: number,
	timeMs: number,
	locale: 'ru' | 'en',
): Promise<void> {
	const challengerName = await getUsername(ch.challengerUserId);
	const challengeeName = await getUsername(ch.challengeeUserId);
	const who = isChallenger ? challengerName : challengeeName;
	const opponent = isChallenger ? challengeeName : challengerName;

	const html = locale === 'ru'
		? `⏳ <b>${escapeHtml(who)}</b> сыграл уровень ${ch.level}: ${stars}⭐ <code>${fmtTime(timeMs)}</code>. Ход за <b>${escapeHtml(opponent)}</b>.`
		: `⏳ <b>${escapeHtml(who)}</b> ran level ${ch.level}: ${stars}⭐ <code>${fmtTime(timeMs)}</code>. <b>${escapeHtml(opponent)}</b>'s turn.`;

	await tgSendMessage(ch.chatId, html);
}


/**
 * Главный entrypoint, вызывается из processGroupResult после успешной
 * group-записи. Делает 2 вещи:
 *  1) Обновляет результат текущего юзера в активных дуэлях с его участием.
 *     Если стало "оба сыграли" — финализируем.
 *  2) Сборка-мусор: финализируем pending-дуэли, у которых истёк срок.
 */
export async function trackChallengeResultAndCollect(args: {
	chatId: number;
	userId: string;
	level: number;
	stars: number;
	timeMs: number;
	locale: 'ru' | 'en';
}): Promise<void> {
	const {chatId, userId, level, stars, timeMs, locale} = args;

	// 1) Активные дуэли с участием текущего юзера на этом уровне.
	const active = await db.select()
		.from(groupChallenges)
		.where(and(
			eq(groupChallenges.chatId, chatId),
			eq(groupChallenges.level, level),
			eq(groupChallenges.status, 'pending'),
			gt(groupChallenges.expiresAt, sql`now()`),
			or(
				eq(groupChallenges.challengerUserId, userId),
				eq(groupChallenges.challengeeUserId, userId),
			),
		));

	for (const ch of active) {
		const isChallenger = ch.challengerUserId === userId;
		const curStars = isChallenger ? ch.challengerStars : ch.challengeeStars;
		const curTime = isChallenger ? ch.challengerTimeMs : ch.challengeeTimeMs;

		// Single-attempt: только если этот юзер ещё НЕ играл в данной дуэли.
		// Любые последующие улучшения не учитываются — first run = duel score.
		if (curStars !== null && curTime !== null) continue;

		const updateFields = isChallenger
			? {challengerStars: stars, challengerTimeMs: timeMs}
			: {challengeeStars: stars, challengeeTimeMs: timeMs};
		await db.update(groupChallenges)
			.set(updateFields)
			.where(eq(groupChallenges.id, ch.id));

		// Перечитываем, чтобы проверить "оба сыграли".
		const [updated] = await db.select()
			.from(groupChallenges)
			.where(eq(groupChallenges.id, ch.id))
			.limit(1);
		if (!updated) continue;

		const bothPlayed =
			updated.challengerStars !== null && updated.challengerTimeMs !== null &&
			updated.challengeeStars !== null && updated.challengeeTimeMs !== null;

		if (bothPlayed) {
			await finalize(updated, locale);
		} else {
			// Один сыграл — постим промежуточный апдейт «ход за вторым».
			await sendIntermediateUpdate(updated, isChallenger, stars, timeMs, locale);
		}
	}

	// 2) Истёкшие pending в этой беседе — финализируем заодно.
	const expired = await db.select()
		.from(groupChallenges)
		.where(and(
			eq(groupChallenges.chatId, chatId),
			eq(groupChallenges.status, 'pending'),
			lt(groupChallenges.expiresAt, sql`now()`),
		));

	for (const ch of expired) {
		await finalize(ch, locale);
	}
}
