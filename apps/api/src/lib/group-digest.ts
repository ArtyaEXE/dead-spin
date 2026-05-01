import {and, eq, gte, isNull, lt, or, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {groupChats} from '../db/schema';
import {tgSendMessage, tgSetMessageReaction} from './telegram-bot';


/**
 * Weekly digest — раз в неделю шлём в каждую активную беседу сводку:
 *  - сколько уровней пройдено за 7 дней
 *  - кто новый лидер по сумме звёзд
 *  - 3 самых ярких рекорда (звёзды/время)
 *
 * Запускается через `POST /cron/weekly-digest` (secret в header'е).
 * Внешний планировщик (cron-job.org, GitHub Actions schedule) бьёт его
 * раз в неделю — на бесплатном Render API спит, поэтому встроенный
 * `setInterval` сюда не годится.
 *
 * Идемпотентность: для каждого чата шлём не чаще раз в 6 дней
 * (`last_digest_at`). Если cron сработал случайно дважды — второй
 * раз будет no-op для всех чатов.
 */


const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


type WeeklyStats = {
	clearsCount: number;
	uniquePlayers: number;
	topByStars: {username: string; gainedStars: number} | null;
	bestRuns: {username: string; level: number; stars: number; timeMs: number}[];
};


async function fetchWeeklyStats(chatId: number): Promise<WeeklyStats> {
	// Все апдейты записей в этом чате за 7 дней.
	const recentRows = await db.execute<{
		username: string;
		level: number;
		stars: number;
		time_ms: number;
		updated_at: string;
	}>(sql`
		select u.username, gpl.level, gpl.stars, gpl.time_ms, gpl.updated_at
		from group_progress_levels gpl
		inner join users u on u.id = gpl.user_id
		where gpl.chat_id = ${chatId}
		  and gpl.updated_at >= now() - interval '7 days'
		order by gpl.stars desc, gpl.time_ms asc
		limit 100
	`);

	const uniquePlayers = new Set(recentRows.map(r => r.username)).size;

	// Сумма звёзд по юзеру за неделю.
	const byPlayer = new Map<string, number>();
	for (const r of recentRows) {
		byPlayer.set(r.username, (byPlayer.get(r.username) ?? 0) + r.stars);
	}
	let topByStars: WeeklyStats['topByStars'] = null;
	for (const [username, gainedStars] of byPlayer) {
		if (!topByStars || gainedStars > topByStars.gainedStars) {
			topByStars = {username, gainedStars};
		}
	}

	const bestRuns = recentRows.slice(0, 3).map(r => ({
		username: r.username,
		level: r.level,
		stars: r.stars,
		timeMs: r.time_ms,
	}));

	return {
		clearsCount: recentRows.length,
		uniquePlayers,
		topByStars,
		bestRuns,
	};
}


function fmtTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}


function buildDigestHtml(stats: WeeklyStats): string {
	if (stats.clearsCount === 0) return '';

	const lines: string[] = [
		'📅 <b>Итоги недели в Dead Spin</b>',
		'',
		`🏁 Прохождений: <b>${stats.clearsCount}</b>`,
		`👥 Активных игроков: <b>${stats.uniquePlayers}</b>`,
	];

	if (stats.topByStars) {
		lines.push('');
		lines.push(`⭐ Звёздная неделя — <b>${escapeHtml(stats.topByStars.username)}</b> (+${stats.topByStars.gainedStars}⭐)`);
	}

	if (stats.bestRuns.length > 0) {
		lines.push('');
		lines.push('🏆 <b>Лучшие забеги недели</b>');
		for (const r of stats.bestRuns) {
			lines.push(`  ${r.stars}⭐  L${r.level}  <code>${fmtTime(r.timeMs)}</code>  ${escapeHtml(r.username)}`);
		}
	}

	return lines.join('\n');
}


export async function runWeeklyDigest(): Promise<{processed: number; sent: number}> {
	const cutoff = new Date(Date.now() - SIX_DAYS_MS);

	const chats = await db.select()
		.from(groupChats)
		.where(and(
			isNull(groupChats.leftAt),
			or(isNull(groupChats.lastDigestAt), lt(groupChats.lastDigestAt, cutoff)),
		));

	let sent = 0;
	for (const chat of chats) {
		try {
			const stats = await fetchWeeklyStats(chat.chatId);
			const html = buildDigestHtml(stats);
			if (!html) {
				// Активности не было — всё равно отметим, чтобы не повторять
				// проверку каждый запуск cron'а.
				await db.update(groupChats)
					.set({lastDigestAt: sql`now()`})
					.where(eq(groupChats.chatId, chat.chatId));
				continue;
			}
			const messageId = await tgSendMessage(chat.chatId, html);
			if (messageId !== null) await tgSetMessageReaction(chat.chatId, messageId, '🏆');
			await db.update(groupChats)
				.set({lastDigestAt: sql`now()`})
				.where(eq(groupChats.chatId, chat.chatId));
			sent++;
		} catch (e) {
			console.warn(`weekly digest failed for chat ${chat.chatId}:`, e instanceof Error ? e.message : e);
		}
	}

	return {processed: chats.length, sent};
}
