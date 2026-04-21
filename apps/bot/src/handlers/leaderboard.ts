import {InlineKeyboard, type Context} from 'grammy';
import {and, asc, desc, eq, sql} from 'drizzle-orm';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {db, schema} from '../db';
import {t} from '../i18n';
import {render} from '../lib/nav';
import {findUserByTgId, getUserLevelRecord} from '../lib/user';
import {LINE, fmtTime, rankEmoji, starsEmoji} from '../lib/format';


const TOP_LIMIT = 10;


function clampLevel(level: number): number {
	if (!Number.isInteger(level)) return 1;
	if (level < 1) return 1;
	if (level > LEVEL_COUNT) return LEVEL_COUNT;
	return level;
}


export async function showLeaderboard(ctx: Context, rawLevel: number): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user) return;

	const L = t(user.locale);
	const level = clampLevel(rawLevel);

	const rows = await db
		.select({
			userId: schema.progressLevels.userId,
			username: schema.users.username,
			stars: schema.progressLevels.stars,
			timeMs: schema.progressLevels.timeMs,
		})
		.from(schema.progressLevels)
		.innerJoin(schema.users, eq(schema.users.id, schema.progressLevels.userId))
		.where(eq(schema.progressLevels.level, level))
		.orderBy(desc(schema.progressLevels.stars), asc(schema.progressLevels.timeMs))
		.limit(TOP_LIMIT);

	const me = await getUserLevelRecord(user.id, level);

	const body = rows.length
		? rows.map((r, i) => {
			const highlight = r.userId === user.id;
			const name = highlight ? `<b>${r.username}</b>` : r.username;
			return `${rankEmoji(i + 1)} ${name}  ${starsEmoji(r.stars)}  <code>${fmtTime(r.timeMs)}</code>`;
		}).join('\n')
		: L.leaderboard.empty;

	let myLine = '';
	if (me) {
		const [rankRow] = await db.execute<{rank: number}>(sql`
			select rank from (
				select user_id, rank() over (order by stars desc, time_ms asc) as rank
				from progress_levels where level = ${level}
			) q where user_id = ${user.id}
		`);
		myLine = rankRow ? `\n\n${L.leaderboard.myRank(Number(rankRow.rank))}` : '';
	} else {
		myLine = `\n\n${L.leaderboard.notPlayedYet}`;
	}

	const text = [L.leaderboard.title(level), '', LINE, '', body].join('\n') + myLine;

	const kb = new InlineKeyboard()
		.text(L.leaderboard.prevLevel, `lb:${level - 1 < 1 ? LEVEL_COUNT : level - 1}`)
		.text(`${level} / ${LEVEL_COUNT}`, 'noop')
		.text(L.leaderboard.nextLevel, `lb:${level + 1 > LEVEL_COUNT ? 1 : level + 1}`)
		.row()
		.text(L.menu.home, 'nav:home');

	await render(ctx, text, kb);
}
