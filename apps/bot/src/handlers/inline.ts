import {InlineKeyboard, type Context} from 'grammy';
import {desc, eq} from 'drizzle-orm';
import {db, schema} from '../db';
import {env} from '../config';
import {findUserByTgId} from '../lib/user';
import {fmtTime} from '../lib/format';


/**
 * Inline-режим бота. В любом чате (Telegram, не обязательно с
 * присутствием бота) пользователь печатает `@dead_spin_new_bot` —
 * ему выпадает кнопка «поделиться рекордом» с превью; тап → пост в
 * чат с дип-линком на игру.
 *
 * Это органический канал распространения: каждый игрок, который
 * хвастается рекордом, превращается в реферал-источник.
 *
 * Что показываем:
 *  - до 3 articles, по топ-уровням игрока (лучшие звёзды/самое быстрое
 *    время)
 *  - если у юзера ещё нет результатов — единственный article «приходи
 *    играть» с deep-link на главное Mini App
 */


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


export async function handleInlineQuery(ctx: Context): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	if (!tgId) {
		await ctx.answerInlineQuery([], {cache_time: 0}).catch(() => {});
		return;
	}

	const user = await findUserByTgId(tgId);
	const botUsername = ctx.me?.username ?? '';
	if (!user) {
		// Незарегистрированный — предлагаем войти
		await ctx.answerInlineQuery([
			{
				type: 'article',
				id: 'register',
				title: '🚀 Dead Spin — поиграй сам',
				description: 'Открой бота /start чтобы попасть в лидерборд',
				input_message_content: {
					message_text: `🚀 <b>Dead Spin</b>\n\nТолько что играл в эту аркаду. Попробуй и ты — <a href="https://t.me/${botUsername}">@${botUsername}</a>`,
					parse_mode: 'HTML',
				},
				reply_markup: new InlineKeyboard().webApp('🎮 Играть', env.WEB_APP_URL),
			},
		], {cache_time: 30}).catch(() => {});
		return;
	}

	// Берём топ-3 рекорда юзера, отсортированных по звёздам desc + время asc
	const topRecords = await db.select({
			level: schema.progressLevels.level,
			stars: schema.progressLevels.stars,
			timeMs: schema.progressLevels.timeMs,
		})
		.from(schema.progressLevels)
		.where(eq(schema.progressLevels.userId, user.id))
		.orderBy(desc(schema.progressLevels.stars), schema.progressLevels.timeMs)
		.limit(3);

	if (topRecords.length === 0) {
		await ctx.answerInlineQuery([{
			type: 'article',
			id: 'invite',
			title: '🚀 Зови играть в Dead Spin',
			description: 'Поделись игрой с друзьями',
			input_message_content: {
				message_text: `🚀 <b>Dead Spin</b>\n\nИгра в Telegram. Попробуй: <a href="https://t.me/${botUsername}?start=ref_${tgId}">@${botUsername}</a>`,
				parse_mode: 'HTML',
			},
			reply_markup: new InlineKeyboard().url(
				'🎮 Открыть',
				`https://t.me/${botUsername}?start=ref_${tgId}`,
			),
		}], {cache_time: 30}).catch(() => {});
		return;
	}

	const articles = topRecords.map((r, i) => ({
		type: 'article' as const,
		id: `record_${r.level}`,
		title: `Уровень ${r.level} — ${r.stars}⭐ за ${fmtTime(r.timeMs)}`,
		description: i === 0 ? 'Поделиться лучшим рекордом' : 'Попробуй обогнать',
		input_message_content: {
			message_text:
				`🚀 <b>Dead Spin</b> — уровень ${r.level}\n` +
				`Мой рекорд: <b>${r.stars}⭐</b> за <code>${fmtTime(r.timeMs)}</code>\n\n` +
				`Кто быстрее? <a href="https://t.me/${botUsername}?start=ref_${tgId}">${escapeHtml(user.username)} зовёт играть</a>`,
			parse_mode: 'HTML' as const,
		},
		reply_markup: new InlineKeyboard().url(
			'🎮 Попробовать',
			`https://t.me/${botUsername}?start=ref_${tgId}`,
		),
	}));

	await ctx.answerInlineQuery(articles, {cache_time: 30, is_personal: true}).catch(() => {});
}
