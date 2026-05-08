import {InlineKeyboard, type Context} from 'grammy';
import {env} from '../config';
import {t, toLocale} from '../i18n';


/**
 * `/feedback` — даёт тестерам прямую ссылку куда писать о багах. URL
 * настраивается через env.FEEDBACK_URL (Telegram-чат, username или
 * GitHub Issues). Если URL не задан — команда отвечает заглушкой,
 * мы её просто игнорируем.
 *
 * Работает в DM и в группах: в группе автоудаление команды через
 * middleware всё равно её снесёт, юзер увидит ответ бота на пару секунд.
 */
export async function handleFeedback(ctx: Context): Promise<void> {
	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	if (!env.FEEDBACK_URL) {
		await ctx.reply(L.feedback.notConfigured, {parse_mode: 'HTML'}).catch(() => {});
		return;
	}

	const kb = new InlineKeyboard().url(L.feedback.button, env.FEEDBACK_URL);
	await ctx.reply(L.feedback.intro, {parse_mode: 'HTML', reply_markup: kb}).catch(() => {});
}
