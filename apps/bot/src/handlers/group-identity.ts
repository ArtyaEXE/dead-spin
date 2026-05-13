import {type Context} from 'grammy';
import {eq, sql} from 'drizzle-orm';
import {db, schema} from '../db';
import {t, toLocale} from '../i18n';


/**
 * `/setname X` и `/setemoji 🚀` — даём беседе кастомное «название команды»
 * + эмодзи-аватар. Используется в Mini App'овской плашке «🚀 Команда X»
 * и потенциально в weekly digest.
 *
 * Только для админов чата (creator/administrator). Иначе любой участник
 * мог бы переименовывать «команду» как угодно.
 */


function isGroupChat(ctx: Context): boolean {
	return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}


async function isAdmin(ctx: Context): Promise<boolean> {
	if (!ctx.chat || !ctx.from) return false;
	try {
		const m = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
		return m.status === 'creator' || m.status === 'administrator';
	} catch {
		return false;
	}
}


function parseTextArg(rawText: string | undefined): string {
	if (!rawText) return '';
	const m = /^\/[a-zA-Z]+(?:@\w+)?\s+(.+)$/.exec(rawText);
	return m && m[1] ? m[1].trim() : '';
}


/** Грубо оцениваем число графем — `[...str].length` режет суррогаты по code-points. */
function graphemeCount(s: string): number {
	return [...s].length;
}


export async function handleSetName(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx) || !ctx.chat) return;
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	if (!await isAdmin(ctx)) {
		await ctx.reply(L.group.identity.adminOnly, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const name = parseTextArg(ctx.message?.text);
	if (!name) {
		await ctx.reply(L.group.identity.usageName, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}
	if (name.length > 32) {
		await ctx.reply(L.group.identity.tooLongName, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	await db.update(schema.groupChats)
		.set({nickname: name, updatedAt: sql`now()`})
		.where(eq(schema.groupChats.chatId, ctx.chat.id));

	await ctx.reply(L.group.identity.nameSaved(name), {parse_mode: 'HTML'}).catch(() => {});
}


/**
 * `/setplay` — без аргументов. Привязывает все API-инициированные
 * нотификации (level-clear, streak-milestone, pinned LB) к теме, в
 * которой вызвана команда. Если вызвать в General — сбрасываем привязку
 * (поле `play_thread_id = NULL`) и всё возвращается в General.
 *
 * Команды юзеров (`/play`, `/lb`, `/me`, `/best` и т.п.) на эту настройку
 * не смотрят — Grammy сам отвечает в той теме, откуда команду прислали.
 */
export async function handleSetPlay(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx) || !ctx.chat) return;
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	if (!await isAdmin(ctx)) {
		await ctx.reply(L.group.identity.adminOnly, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	// `message_thread_id` отсутствует если сообщение в General. У forum-сообщений
	// он есть всегда. Сохраняем как есть (или NULL для General).
	const threadId = ctx.message?.message_thread_id ?? null;

	await db.update(schema.groupChats)
		.set({playThreadId: threadId, updatedAt: sql`now()`})
		.where(eq(schema.groupChats.chatId, ctx.chat.id));

	const text = threadId === null
		? L.group.identity.playThreadCleared
		: L.group.identity.playThreadSet;
	await ctx.reply(text, {parse_mode: 'HTML'}).catch(() => {});
}


export async function handleSetEmoji(ctx: Context): Promise<void> {
	if (!isGroupChat(ctx) || !ctx.chat) return;
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	if (!await isAdmin(ctx)) {
		await ctx.reply(L.group.identity.adminOnly, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const arg = parseTextArg(ctx.message?.text);
	if (!arg) {
		await ctx.reply(L.group.identity.usageEmoji, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}
	const count = graphemeCount(arg);
	if (count !== 1) {
		await ctx.reply(L.group.identity.oneEmoji, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	await db.update(schema.groupChats)
		.set({emoji: arg, updatedAt: sql`now()`})
		.where(eq(schema.groupChats.chatId, ctx.chat.id));

	await ctx.reply(L.group.identity.emojiSaved(arg), {parse_mode: 'HTML'}).catch(() => {});
}
