import {InlineKeyboard, type Context} from 'grammy';
import {t} from '../i18n';
import {render} from '../lib/nav';
import {findUserByTgId} from '../lib/user';
import {LINE} from '../lib/format';


export async function showHelp(ctx: Context): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = tgId ? await findUserByTgId(tgId) : null;
	const L = t(user?.locale ?? ctx.from?.language_code ?? 'en');

	const faq = [L.help.howToPlay, L.help.fuel, L.help.stars, L.help.records]
		.map(f => `<b>${f.q}</b>\n<blockquote expandable>${f.a}</blockquote>`)
		.join('\n\n');

	const text = [
		L.help.title,
		'',
		L.help.intro,
		'',
		LINE,
		'',
		faq,
		'',
		LINE,
		'',
		`<i>${L.help.support}</i>`,
	].join('\n');

	const kb = new InlineKeyboard().text(L.menu.home, 'nav:home');
	await render(ctx, text, kb);
}
