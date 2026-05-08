import {InlineKeyboard, type Context} from 'grammy';
import {eq} from 'drizzle-orm';
import {db, schema} from '../db';
import {findUserByTgId} from '../lib/user';
import {t, toLocale} from '../i18n';


/**
 * `/reset` в DM — обнуляет прогресс игрока (для тестеров, которые
 * залипли в плохом состоянии и хотят начать с нуля). Двухшаговый:
 *  1) `/reset` → бот шлёт «уверен?» с inline-кнопками yes/no
 *  2) callback yes → реально удаляет записи + подтверждение
 *
 * Сносит: progress_levels (глобал), progresses (summary), все записи
 * в group_progress_levels (per-chat). Не трогает: fuel, coins, скины,
 * платежи, сам user-row.
 *
 * В группах команда не работает — там пишем «только в личке», чтобы
 * не сбросить случайно из чата (и чтобы сообщение не вырезалось
 * auto-cleanup'ом до того как юзер прочёл).
 */


function isPrivateChat(ctx: Context): boolean {
	return ctx.chat?.type === 'private';
}


export async function handleResetCommand(ctx: Context): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	if (!isPrivateChat(ctx)) {
		await ctx.reply(L.reset.privateOnly, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const kb = new InlineKeyboard()
		.text(L.reset.yes, 'reset:yes')
		.text(L.reset.no, 'reset:no');
	await ctx.reply(L.reset.confirm, {parse_mode: 'HTML', reply_markup: kb});
}


export async function handleResetConfirm(ctx: Context): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	const tgId = String(ctx.from?.id ?? '');
	const user = tgId ? await findUserByTgId(tgId) : null;
	if (!user) {
		await ctx.answerCallbackQuery();
		return;
	}

	await db.transaction(async (tx) => {
		await tx.delete(schema.progressLevels).where(eq(schema.progressLevels.userId, user.id));
		await tx.delete(schema.progresses).where(eq(schema.progresses.userId, user.id));
		await tx.delete(schema.groupProgressLevels).where(eq(schema.groupProgressLevels.userId, user.id));
	});

	await ctx.answerCallbackQuery({text: L.reset.done});
	await ctx.editMessageText(L.reset.doneFull, {parse_mode: 'HTML'}).catch(() => {});
}


export async function handleResetCancel(ctx: Context): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);
	await ctx.answerCallbackQuery();
	await ctx.editMessageText(L.reset.cancelled, {parse_mode: 'HTML'}).catch(() => {});
}
