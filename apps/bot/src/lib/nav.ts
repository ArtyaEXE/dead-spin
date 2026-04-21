import type {Context, InlineKeyboard} from 'grammy';


/**
 * Рендер одного экрана: если пришёл callback — редактируем существующее
 * сообщение; если пришёл command/text — шлём новое. Это держит чат чистым
 * (одно "приложение" на одно сообщение) и убирает спам.
 *
 * Telegram бросает ошибку "message is not modified", если текст и клавиатура
 * те же — её глотаем, это нормальный случай.
 */
export async function render(
	ctx: Context,
	text: string,
	keyboard: InlineKeyboard,
): Promise<void> {
	const opts = {
		parse_mode: 'HTML' as const,
		reply_markup: keyboard,
		link_preview_options: {is_disabled: true},
	};

	if (ctx.callbackQuery) {
		try {
			await ctx.editMessageText(text, opts);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!msg.includes('message is not modified')) {
				// Если редактировать нечего (сообщение удалено, слишком старое) — шлём новое.
				if (ctx.chat) await ctx.api.sendMessage(ctx.chat.id, text, opts);
			}
		}
		await ctx.answerCallbackQuery().catch(() => {});
	} else {
		if (!ctx.chat) return;
		await ctx.api.sendMessage(ctx.chat.id, text, opts);
	}
}


/** Быстрый toast-ответ на callback (исчезающее уведомление сверху). */
export async function toast(ctx: Context, text: string, alert = false): Promise<void> {
	if (!ctx.callbackQuery) return;
	await ctx.answerCallbackQuery({text, show_alert: alert}).catch(() => {});
}
