import {type Context, InlineKeyboard} from 'grammy';
import {and, eq, gt, sql} from 'drizzle-orm';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {db, schema} from '../db';
import {t, toLocale} from '../i18n';
import {findUserByTgId} from '../lib/user';


/**
 * `/challenge @username N` — дуэль 1×1 на уровне N в этой беседе. Через
 * 24 часа (или раньше, когда оба сыграли) бот объявит победителя по
 * правилу: больше звёзд > меньше времени.
 *
 * @user определяется по username из БД (мы храним telegram username
 * в `users.username`). Если такого юзера нет — отказ.
 *
 * Создание дуэли НЕ требует подтверждения от вызываемого — он просто
 * играет уровень в обычном режиме, мы засчитаем результат автоматически.
 */


const DUEL_DURATION_MS = 24 * 60 * 60 * 1000;


function isGroupChat(ctx: Context): boolean {
	return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/**
 * Парсим `/challenge[@bot] @username N` либо `/challenge[@bot] @username  N`.
 * Возвращает {username, level} или null если формат не подходит.
 */
function parseArgs(text: string | undefined): {username: string; level: number} | null {
	if (!text) return null;
	const m = /^\/challenge(?:@\w+)?\s+@(\w+)\s+(\d+)/.exec(text);
	if (!m) return null;
	const level = Number(m[2]);
	if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) return null;
	return {username: m[1]!, level};
}


export async function handleChallenge(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx) || !ctx.chat || !ctx.from) return;

	const locale = toLocale(ctx.from.language_code ?? 'en');
	const L = t(locale);

	const args = parseArgs(ctx.message?.text);
	if (!args) {
		await ctx.reply(L.group.challenge.usage, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const challenger = await findUserByTgId(String(ctx.from.id));
	if (!challenger) {
		await ctx.reply(L.group.stats.notRegistered, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	// Резолвим вызываемого по username (case-insensitive).
	const [challengee] = await db.select()
		.from(schema.users)
		.where(sql`lower(${schema.users.username}) = lower(${args.username})`)
		.limit(1);
	if (!challengee) {
		await ctx.reply(L.group.challenge.userNotFound(args.username), {parse_mode: 'HTML'}).catch(() => {});
		return;
	}
	if (challengee.id === challenger.id) {
		await ctx.reply(L.group.challenge.selfChallenge, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	// Уже есть pending-дуэль между этими двумя на том же уровне? Не плодим.
	const [existing] = await db.select()
		.from(schema.groupChallenges)
		.where(and(
			eq(schema.groupChallenges.chatId, ctx.chat.id),
			eq(schema.groupChallenges.level, args.level),
			eq(schema.groupChallenges.status, 'pending'),
			gt(schema.groupChallenges.expiresAt, sql`now()`),
			sql`(
				(${schema.groupChallenges.challengerUserId} = ${challenger.id} and ${schema.groupChallenges.challengeeUserId} = ${challengee.id})
				or
				(${schema.groupChallenges.challengerUserId} = ${challengee.id} and ${schema.groupChallenges.challengeeUserId} = ${challenger.id})
			)`,
		))
		.limit(1);
	if (existing) {
		await ctx.reply(L.group.challenge.alreadyPending, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const expiresAt = new Date(Date.now() + DUEL_DURATION_MS);
	const text = L.group.challenge.posted(
		escapeHtml(challenger.username),
		escapeHtml(challengee.username),
		args.level,
	);

	const sent = await ctx.reply(text, {parse_mode: 'HTML'});

	await db.insert(schema.groupChallenges).values({
		chatId: ctx.chat.id,
		level: args.level,
		challengerUserId: challenger.id,
		challengeeUserId: challengee.id,
		messageId: sent.message_id,
		expiresAt,
	});
}
