import {InlineKeyboard, type Context} from 'grammy';
import {eq, sql} from 'drizzle-orm';
import {db, schema} from '../db';
import {t, toLocale, type Locale} from '../i18n';
import {render, toast} from '../lib/nav';
import {findUserByTgId} from '../lib/user';
import {LINE} from '../lib/format';
import {showMainMenu} from './menu';


export async function showSettings(ctx: Context): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user) return;

	const L = t(user.locale);
	const current = toLocale(user.locale);

	const text = [
		L.settings.title,
		'',
		LINE,
		'',
		`<b>${L.settings.language}</b>`,
		'',
		`${current === 'ru' ? '🔵' : '⚪'} ${L.settings.languageRu}`,
		`${current === 'en' ? '🔵' : '⚪'} ${L.settings.languageEn}`,
	].join('\n');

	const kb = new InlineKeyboard()
		.text(L.settings.languageRu, 'settings:locale:ru')
		.text(L.settings.languageEn, 'settings:locale:en').row()
		.text(L.menu.home, 'nav:home');

	await render(ctx, text, kb);
}


export async function setLocale(ctx: Context, locale: Locale): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user) return;

	if (user.locale !== locale) {
		await db.update(schema.users)
			.set({locale, updatedAt: sql`now()`})
			.where(eq(schema.users.id, user.id));
	}

	const L = t(locale);
	await toast(ctx, L.settings.saved);
	// После смены локали сразу возвращаемся на главную с новым языком.
	await showMainMenu(ctx);
}
