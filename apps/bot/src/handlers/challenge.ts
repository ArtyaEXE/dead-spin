import {type Context, InlineKeyboard} from 'grammy';
import {and, eq, lt, or, sql} from 'drizzle-orm';
import {db, schema} from '../db';
import {t, toLocale, type Locale} from '../i18n';
import {findUserByTgId} from '../lib/user';


/**
 * `/challenge @username` — вызов оппонента на дуэль в этой беседе.
 *
 * Уровень выбирается случайно из тех, где **оба** имеют запись в
 * group_progress_levels. Жизненный цикл (см. также apps/api/src/lib/group-challenges.ts):
 *   pending_accept (30 мин на принятие)
 *     → active (1 час, неогранич. попыток, лучший заход в зачёт)
 *     → completed | declined | cancelled | expired_no_accept | expired_no_play
 *
 * Один активный челлендж на юзера: если у инициатора или у вызываемого
 * уже есть pending/active — отказ.
 *
 * Замечание про архитектуру: бизнес-логика дублируется с API частично —
 * бот делает create/accept/decline/cancel сам через прямые drizzle-запросы
 * (бот и API в разных пакетах). Финализация expired-челленджей и обработка
 * level-complete живут только в API (apps/api/src/lib/group-challenges.ts) —
 * туда триггерят запросы из Mini App.
 */


const ACCEPT_WINDOW_MS = 30 * 60 * 1000;


function isGroupChat(ctx: Context): boolean {
	return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


function parseUsername(text: string | undefined): string | null {
	if (!text) return null;
	const m = /^\/challenge(?:@\w+)?\s+@(\w+)/.exec(text);
	return m ? m[1]! : null;
}


function pickRandom<T>(arr: T[]): T | null {
	if (arr.length === 0) return null;
	return arr[Math.floor(Math.random() * arr.length)] ?? null;
}


function makeInviteKeyboard(challengeId: string, locale: Locale): InlineKeyboard {
	const L = t(locale);
	return new InlineKeyboard()
		.text(L.group.challenge.btnAccept, `ch:accept:${challengeId}`)
		.text(L.group.challenge.btnDecline, `ch:decline:${challengeId}`).row()
		.text(L.group.challenge.btnCancel, `ch:cancel:${challengeId}`);
}


/** Уровни, где **оба** юзера имеют запись в этой беседе. */
async function commonLevels(chatId: number, userA: string, userB: string): Promise<number[]> {
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


async function findActiveOrPending(userId: string): Promise<typeof schema.groupChallenges.$inferSelect | null> {
	const [row] = await db.select()
		.from(schema.groupChallenges)
		.where(and(
			or(
				eq(schema.groupChallenges.challengerUserId, userId),
				eq(schema.groupChallenges.challengeeUserId, userId),
			),
			or(
				eq(schema.groupChallenges.status, 'pending_accept'),
				eq(schema.groupChallenges.status, 'active'),
			),
		))
		.limit(1);
	return row ?? null;
}


/**
 * Локальная подметалка: помечает истёкшие pending_accept как expired_no_accept.
 * Полная финализация active+expired живёт в API (нужны recording'и + edit
 * message с TG API). Здесь — только освобождение слота под «1 active per user»,
 * чтобы юзер мог сразу создать новый челлендж после истечения окна принятия.
 */
async function sweepExpiredAccepts(chatId: number): Promise<void> {
	await db.update(schema.groupChallenges)
		.set({status: 'expired_no_accept', resolvedAt: sql`now()`})
		.where(and(
			eq(schema.groupChallenges.chatId, chatId),
			eq(schema.groupChallenges.status, 'pending_accept'),
			lt(schema.groupChallenges.expiresAt, sql`now()`),
		))
		.catch(() => {/* best-effort */});
}


export async function handleChallenge(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx) || !ctx.chat || !ctx.from) return;

	const locale = toLocale(ctx.from.language_code ?? 'en');
	const L = t(locale);
	const chatId = ctx.chat.id;

	void sweepExpiredAccepts(chatId);

	const username = parseUsername(ctx.message?.text);
	if (!username) {
		await ctx.reply(L.group.challenge.usage, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const challenger = await findUserByTgId(String(ctx.from.id));
	if (!challenger) {
		await ctx.reply(L.group.stats.notRegistered, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const [challengee] = await db.select()
		.from(schema.users)
		.where(sql`lower(${schema.users.username}) = lower(${username})`)
		.limit(1);
	if (!challengee) {
		await ctx.reply(L.group.challenge.userNotFound(username), {parse_mode: 'HTML'}).catch(() => {});
		return;
	}
	if (challengee.id === challenger.id) {
		await ctx.reply(L.group.challenge.selfChallenge, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	if (await findActiveOrPending(challenger.id)) {
		await ctx.reply(L.group.challenge.youHaveActive, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}
	if (await findActiveOrPending(challengee.id)) {
		await ctx.reply(L.group.challenge.opponentHasActive(escapeHtml(challengee.username)), {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const common = await commonLevels(chatId, challenger.id, challengee.id);
	const level = pickRandom(common);
	if (level === null) {
		await ctx.reply(L.group.challenge.noCommonLevels(escapeHtml(challengee.username)), {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const expiresAt = new Date(Date.now() + ACCEPT_WINDOW_MS);
	const [created] = await db.insert(schema.groupChallenges)
		.values({
			chatId,
			level,
			challengerUserId: challenger.id,
			challengeeUserId: challengee.id,
			status: 'pending_accept',
			expiresAt,
		})
		.returning({id: schema.groupChallenges.id});
	if (!created) {
		console.warn('createChallenge: insert returned nothing');
		return;
	}

	const text = L.group.challenge.posted(
		escapeHtml(challenger.username),
		escapeHtml(challengee.username),
		level,
	);

	try {
		const sent = await ctx.reply(text, {parse_mode: 'HTML', reply_markup: makeInviteKeyboard(created.id, locale)});
		await db.update(schema.groupChallenges)
			.set({messageId: sent.message_id})
			.where(eq(schema.groupChallenges.id, created.id));
	} catch (e) {
		console.warn('challenge reply failed:', e instanceof Error ? e.message : e);
	}
}


// ─── Callback handlers (`ch:accept|decline|cancel:<id>`) ─────────────


async function answerToast(ctx: Context, text: string, alert = false): Promise<void> {
	if (!ctx.callbackQuery) return;
	await ctx.answerCallbackQuery({text, show_alert: alert}).catch(() => {});
}


async function getRow(id: string): Promise<typeof schema.groupChallenges.$inferSelect | null> {
	const [row] = await db.select().from(schema.groupChallenges).where(eq(schema.groupChallenges.id, id)).limit(1);
	return row ?? null;
}


function txtActive(challenger: string, challengee: string, level: number, locale: Locale): string {
	if (locale === 'ru') {
		return `⚔️ <b>Дуэль активна!</b>\n\n` +
			`<b>${challenger}</b> vs <b>${challengee}</b>\n` +
			`🎯 Уровень: <b>${level}</b>\n` +
			`⏳ Час на любое количество попыток. Лучший заход — в зачёт.`;
	}
	return `⚔️ <b>Duel is on!</b>\n\n` +
		`<b>${challenger}</b> vs <b>${challengee}</b>\n` +
		`🎯 Level: <b>${level}</b>\n` +
		`⏳ One hour, unlimited attempts. Best run counts.`;
}


function txtDeclined(challenger: string, challengee: string, level: number, locale: Locale): string {
	if (locale === 'ru') {
		return `✕ <b>${challengee}</b> отклонил вызов от <b>${challenger}</b> (уровень ${level}).`;
	}
	return `✕ <b>${challengee}</b> declined the duel from <b>${challenger}</b> (level ${level}).`;
}


function txtCancelled(challenger: string, challengee: string, level: number, locale: Locale): string {
	if (locale === 'ru') {
		return `⏎ <b>${challenger}</b> отменил дуэль с <b>${challengee}</b> (уровень ${level}).`;
	}
	return `⏎ <b>${challenger}</b> cancelled the duel with <b>${challengee}</b> (level ${level}).`;
}


export async function handleAcceptCallback(ctx: Context, challengeId: string): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);
	if (!ctx.from) return;
	const me = await findUserByTgId(String(ctx.from.id));
	if (!me) {
		await answerToast(ctx, L.group.stats.notRegistered.replace(/<[^>]+>/g, ''));
		return;
	}

	const ch = await getRow(challengeId);
	if (!ch) {
		await answerToast(ctx, L.group.challenge.notFound, true);
		return;
	}
	if (ch.challengeeUserId !== me.id) {
		await answerToast(ctx, L.group.challenge.notForYou, true);
		return;
	}
	if (ch.status !== 'pending_accept') {
		await answerToast(ctx, L.group.challenge.alreadyResolved, true);
		return;
	}
	if (ch.expiresAt.getTime() < Date.now()) {
		await answerToast(ctx, L.group.challenge.expired, true);
		// Обновим запись, чтобы освободить слот.
		await db.update(schema.groupChallenges)
			.set({status: 'expired_no_accept', resolvedAt: sql`now()`})
			.where(eq(schema.groupChallenges.id, challengeId));
		return;
	}

	const acceptedAt = new Date();
	const newExpiresAt = new Date(acceptedAt.getTime() + 60 * 60 * 1000);
	await db.update(schema.groupChallenges)
		.set({status: 'active', acceptedAt, expiresAt: newExpiresAt})
		.where(eq(schema.groupChallenges.id, challengeId));

	const [challengerUser] = await db.select({username: schema.users.username})
		.from(schema.users).where(eq(schema.users.id, ch.challengerUserId)).limit(1);
	const [challengeeUser] = await db.select({username: schema.users.username})
		.from(schema.users).where(eq(schema.users.id, ch.challengeeUserId)).limit(1);
	const challengerName = escapeHtml(challengerUser?.username ?? 'unknown');
	const challengeeName = escapeHtml(challengeeUser?.username ?? 'unknown');

	if (ch.messageId !== null && ctx.chat) {
		const text = txtActive(challengerName, challengeeName, ch.level, locale);
		await ctx.api.editMessageText(ctx.chat.id, ch.messageId, text, {
			parse_mode: 'HTML',
		}).catch(() => {});
		await ctx.api.setMessageReaction(ctx.chat.id, ch.messageId, [{type: 'emoji', emoji: '⚡'}]).catch(() => {});
	}
	await answerToast(ctx, L.group.challenge.accepted);
}


export async function handleDeclineCallback(ctx: Context, challengeId: string): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);
	if (!ctx.from) return;
	const me = await findUserByTgId(String(ctx.from.id));
	if (!me) return;

	const ch = await getRow(challengeId);
	if (!ch) {
		await answerToast(ctx, L.group.challenge.notFound, true);
		return;
	}
	if (ch.challengeeUserId !== me.id) {
		await answerToast(ctx, L.group.challenge.notForYou, true);
		return;
	}
	if (ch.status !== 'pending_accept') {
		await answerToast(ctx, L.group.challenge.alreadyResolved, true);
		return;
	}

	await db.update(schema.groupChallenges)
		.set({status: 'declined', resolvedAt: sql`now()`})
		.where(eq(schema.groupChallenges.id, challengeId));

	const [challengerUser] = await db.select({username: schema.users.username})
		.from(schema.users).where(eq(schema.users.id, ch.challengerUserId)).limit(1);
	const [challengeeUser] = await db.select({username: schema.users.username})
		.from(schema.users).where(eq(schema.users.id, ch.challengeeUserId)).limit(1);
	const challengerName = escapeHtml(challengerUser?.username ?? 'unknown');
	const challengeeName = escapeHtml(challengeeUser?.username ?? 'unknown');

	if (ch.messageId !== null && ctx.chat) {
		await ctx.api.editMessageText(ctx.chat.id, ch.messageId, txtDeclined(challengerName, challengeeName, ch.level, locale), {
			parse_mode: 'HTML',
		}).catch(() => {});
	}
	await answerToast(ctx, L.group.challenge.declinedToast);
}


export async function handleCancelCallback(ctx: Context, challengeId: string): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);
	if (!ctx.from) return;
	const me = await findUserByTgId(String(ctx.from.id));
	if (!me) return;

	const ch = await getRow(challengeId);
	if (!ch) {
		await answerToast(ctx, L.group.challenge.notFound, true);
		return;
	}
	if (ch.challengerUserId !== me.id) {
		await answerToast(ctx, L.group.challenge.notForYou, true);
		return;
	}
	if (ch.status !== 'pending_accept') {
		await answerToast(ctx, L.group.challenge.alreadyResolved, true);
		return;
	}

	await db.update(schema.groupChallenges)
		.set({status: 'cancelled', resolvedAt: sql`now()`})
		.where(eq(schema.groupChallenges.id, challengeId));

	const [challengerUser] = await db.select({username: schema.users.username})
		.from(schema.users).where(eq(schema.users.id, ch.challengerUserId)).limit(1);
	const [challengeeUser] = await db.select({username: schema.users.username})
		.from(schema.users).where(eq(schema.users.id, ch.challengeeUserId)).limit(1);
	const challengerName = escapeHtml(challengerUser?.username ?? 'unknown');
	const challengeeName = escapeHtml(challengeeUser?.username ?? 'unknown');

	if (ch.messageId !== null && ctx.chat) {
		await ctx.api.editMessageText(ctx.chat.id, ch.messageId, txtCancelled(challengerName, challengeeName, ch.level, locale), {
			parse_mode: 'HTML',
		}).catch(() => {});
	}
	await answerToast(ctx, L.group.challenge.cancelledToast);
}
