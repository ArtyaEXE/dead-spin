import type {Context} from 'grammy';
import {InlineKeyboard} from 'grammy';
import {t} from '../i18n';
import {env} from '../config';
import {ensureUser} from '../lib/user';
import {LINE} from '../lib/format';
import {showMainMenu} from './menu';


/**
 * /start — онбординг.
 *
 * 1) Валидируем Telegram-юзера (нужен username).
 * 2) Ensure user в БД, на первом входе — создаём + allowlist (в dev авто).
 * 3) Показываем welcome-сообщение (новому юзеру) или сразу главное меню (старому).
 */
export async function handleStart(ctx: Context): Promise<void> {
	if (!ctx.from || !ctx.chat) return;
	if (ctx.from.is_bot) return;

	const tgId = String(ctx.from.id);
	const username = ctx.from.username ?? '';
	const locale = ctx.from.language_code ?? 'en';
	const L = t(locale);

	if (!username) {
		await ctx.reply(L.welcome.needUsername, {parse_mode: 'HTML'});
		return;
	}

	const result = await ensureUser({tgId, username, locale});
	if (!result.ok) {
		await ctx.reply(L.welcome.notAllowed, {parse_mode: 'HTML'});
		return;
	}

	if (!result.isNew) {
		await showMainMenu(ctx);
		return;
	}

	// Первое приветствие — отдельным сообщением, чтобы запомнилось.
	const UL = t(result.user.locale);
	const text = [
		UL.welcome.title,
		'',
		UL.welcome.greeting(result.user.username),
		'',
		UL.welcome.tagline,
		'',
		LINE,
		'',
		UL.welcome.registered,
	].join('\n');

	const kb = new InlineKeyboard()
		.webApp(UL.menu.play, env.WEB_APP_URL).row()
		.text(UL.menu.help, 'help:open').text(UL.menu.home, 'nav:home');

	await ctx.reply(text, {parse_mode: 'HTML', reply_markup: kb});
}
