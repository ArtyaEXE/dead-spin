import {InlineKeyboard, type Bot} from 'grammy';
import {and, eq, isNull, gte, lte, sql} from 'drizzle-orm';
import {db, schema} from '../../db';
import {env} from '../../config';
import {t, toLocale} from '../../i18n';
import {isQuietHourUTC} from './quiet-hours';


const BATCH_LIMIT = 50;
const SEND_GAP_MS = 50;


/**
 * One-time DM «понравилась игра? — загляни в чат». Шлём один раз за
 * жизнь юзера: после отправки `review_prompt_sent_at` заполняется
 * навсегда. Так мы избегаем «отслеживания закрытия miniapp», которое
 * в Telegram WebApp ненадёжно — вместо этого ловим момент когда юзер
 * уже наигрался (≥ REVIEW_PROMPT_MIN_STARS звёзд) и недавно отошёл
 * от игры (REVIEW_PROMPT_IDLE_MIN минут тишины в `users.updatedAt`).
 *
 * Цель — попасть в момент, когда чат с ботом всё ещё помнится, но
 * юзер не посреди раунда. UTC-тихие часы те же что и для full-fuel.
 */
export async function sweepReviewPrompt(bot: Bot, now: Date = new Date()): Promise<{
	scanned: number;
	sent: number;
	skipped: number;
	failed: number;
}> {
	const url = env.COMMUNITY_URL || env.FEEDBACK_URL;
	if (!url) {
		// Без целевой ссылки бессмысленно — никуда вести юзера.
		return {scanned: 0, sent: 0, skipped: 0, failed: 0};
	}
	if (isQuietHourUTC(now, env.PUSH_QUIET_HOURS_UTC)) {
		return {scanned: 0, sent: 0, skipped: 0, failed: 0};
	}

	const idleCutoff = new Date(now.getTime() - env.REVIEW_PROMPT_IDLE_MIN * 60 * 1000);
	const maxAgeCutoff = new Date(now.getTime() - env.PUSH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

	// JOIN на progresses чтобы получить summary_stars и отфильтровать по
	// порогу. inner join — если у юзера нет записи в progresses, это
	// странно и до прода такое не доходит (см. ensureUser).
	const candidates = await db
		.select({
			id: schema.users.id,
			tgId: schema.users.tgId,
			locale: schema.users.locale,
		})
		.from(schema.users)
		.innerJoin(schema.progresses, eq(schema.progresses.userId, schema.users.id))
		.where(and(
			isNull(schema.users.reviewPromptSentAt),
			gte(schema.progresses.summaryStars, env.REVIEW_PROMPT_MIN_STARS),
			lte(schema.users.updatedAt, idleCutoff),
			gte(schema.users.updatedAt, maxAgeCutoff),
		))
		.limit(BATCH_LIMIT);

	let sent = 0;
	let failed = 0;
	for (const u of candidates) {
		const L = t(toLocale(u.locale)).push.review;
		const kb = new InlineKeyboard().url(L.cta, url);
		const ok = await bot.api.sendMessage(
			u.tgId,
			`${L.title}\n${L.body}`,
			{parse_mode: 'HTML', reply_markup: kb, disable_notification: false},
		).then(() => true).catch((err: Error) => {
			console.warn(`[sweep:review] sendMessage failed for ${u.tgId}: ${err.message}`);
			return false;
		});

		// Штамп ставим даже при неуспехе — иначе будем долбиться к юзеру
		// который заблокировал бота. Одна попытка на юзера, by design.
		await db.update(schema.users)
			.set({reviewPromptSentAt: sql`now()`})
			.where(eq(schema.users.id, u.id));

		if (ok) sent++;
		else failed++;

		if (SEND_GAP_MS > 0) await new Promise(r => setTimeout(r, SEND_GAP_MS));
	}

	return {scanned: candidates.length, sent, skipped: 0, failed};
}
