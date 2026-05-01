import {type Context} from 'grammy';
import {and, asc, desc, eq, sql} from 'drizzle-orm';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {db, schema} from '../db';
import {t, toLocale} from '../i18n';
import {LINE, fmtTime, rankEmoji, starsEmoji, escapeHtml} from '../lib/format';
import {findUserByTgId} from '../lib/user';


/**
 * Групповые команды статистики — действуют только в чатах группы.
 * `/lb [N]` — лидерборд уровня N в этой беседе (N = 1 если не указан).
 * `/me`     — твоя статистика в этой беседе.
 * `/best`   — лучшие результаты каждого участника беседы по всем уровням.
 *
 * Все запросы к БД скоупятся по `ctx.chat.id`. В DM команды тихо
 * игнорируются — там для статов есть отдельный `/menu`.
 */


const TOP_LIMIT = 10;


function isGroupChat(ctx: Context): boolean {
	return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}


/** Парсим число после команды: "/lb 5" → 5; clamp в [1..LEVEL_COUNT]. */
function parseLevelArg(text: string | undefined): number {
	if (!text) return 1;
	const m = /\s+(\d+)$/.exec(text);
	if (!m) return 1;
	const n = Number(m[1]);
	if (!Number.isInteger(n)) return 1;
	return Math.max(1, Math.min(LEVEL_COUNT, n));
}


export async function handleGroupLeaderboard(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx)) return;
	const chatId = ctx.chat!.id;
	const level = parseLevelArg(ctx.message?.text);
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	const rows = await db
		.select({
			userId: schema.groupProgressLevels.userId,
			username: schema.users.username,
			stars: schema.groupProgressLevels.stars,
			timeMs: schema.groupProgressLevels.timeMs,
		})
		.from(schema.groupProgressLevels)
		.innerJoin(schema.users, eq(schema.users.id, schema.groupProgressLevels.userId))
		.where(and(
			eq(schema.groupProgressLevels.chatId, chatId),
			eq(schema.groupProgressLevels.level, level),
		))
		.orderBy(desc(schema.groupProgressLevels.stars), asc(schema.groupProgressLevels.timeMs))
		.limit(TOP_LIMIT);

	const me = ctx.from ? await findUserByTgId(String(ctx.from.id)) : null;

	const body = rows.length
		? rows.map((r, i) => {
			const isMe = me && r.userId === me.id;
			const name = isMe ? `<b>${escapeHtml(r.username)}</b>` : escapeHtml(r.username);
			return `${rankEmoji(i + 1)} ${name}  ${starsEmoji(r.stars)}  <code>${fmtTime(r.timeMs)}</code>`;
		}).join('\n')
		: L.leaderboard.empty;

	const text = [L.leaderboard.title(level), '', LINE, '', body].join('\n');
	await ctx.reply(text, {parse_mode: 'HTML'});
}


export async function handleGroupMe(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx)) return;
	if (!ctx.from) return;

	const chatId = ctx.chat!.id;
	const tgId = String(ctx.from.id);
	const user = await findUserByTgId(tgId);
	const locale = toLocale(ctx.from.language_code ?? 'en');
	const L = t(locale);

	if (!user) {
		await ctx.reply(L.group.stats.notRegistered, {parse_mode: 'HTML'});
		return;
	}

	const rows = await db
		.select({
			level: schema.groupProgressLevels.level,
			stars: schema.groupProgressLevels.stars,
			timeMs: schema.groupProgressLevels.timeMs,
		})
		.from(schema.groupProgressLevels)
		.where(and(
			eq(schema.groupProgressLevels.chatId, chatId),
			eq(schema.groupProgressLevels.userId, user.id),
		))
		.orderBy(asc(schema.groupProgressLevels.level));

	if (rows.length === 0) {
		await ctx.reply(L.group.stats.youNothing, {parse_mode: 'HTML'});
		return;
	}

	const totalStars = rows.reduce((acc, r) => acc + r.stars, 0);
	const maxStars = LEVEL_COUNT * 3;
	const linesPerLevel = rows
		.map(r => `  ${r.level}. ${starsEmoji(r.stars)}  <code>${fmtTime(r.timeMs)}</code>`)
		.join('\n');

	const text = [
		L.group.stats.youTitle(escapeHtml(user.username)),
		'',
		L.group.stats.youSummary(rows.length, LEVEL_COUNT, totalStars, maxStars),
		'',
		LINE,
		'',
		linesPerLevel,
	].join('\n');

	await ctx.reply(text, {parse_mode: 'HTML'});
}


export async function handleGroupBest(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx)) return;
	const chatId = ctx.chat!.id;
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	// Top по совокупности звёзд: SUM(stars) per user, тай-брейк — суммарное время.
	const rows = await db.execute<{
		user_id: string;
		username: string;
		total_stars: number;
		total_time_ms: number;
		levels_done: number;
	}>(sql`
		select
			u.id as user_id,
			u.username,
			coalesce(sum(gpl.stars), 0)::int as total_stars,
			coalesce(sum(gpl.time_ms), 0)::int as total_time_ms,
			count(gpl.level)::int as levels_done
		from group_progress_levels gpl
		inner join users u on u.id = gpl.user_id
		where gpl.chat_id = ${chatId}
		group by u.id, u.username
		order by total_stars desc, total_time_ms asc
		limit ${TOP_LIMIT}
	`);

	if (rows.length === 0) {
		await ctx.reply(L.group.stats.bestEmpty, {parse_mode: 'HTML'});
		return;
	}

	const lines = rows.map((r, i) =>
		`${rankEmoji(i + 1)} ${escapeHtml(r.username)}  ${r.total_stars}⭐  <code>${r.levels_done}/${LEVEL_COUNT}</code>`,
	);

	const text = [
		L.group.stats.bestTitle,
		'',
		LINE,
		'',
		lines.join('\n'),
	].join('\n');

	await ctx.reply(text, {parse_mode: 'HTML'});
}
