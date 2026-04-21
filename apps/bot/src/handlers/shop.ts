import {InlineKeyboard, type Context} from 'grammy';
import {t, toLocale} from '../i18n';
import {LOTS, type Lot} from '../lots';
import {render, toast} from '../lib/nav';
import {findUserByTgId} from '../lib/user';
import {LINE, fmtNum} from '../lib/format';


function lotLine(lot: Lot, locale: 'ru' | 'en'): string {
	return [
		`${lot.emoji} <b>${lot.title[locale]}</b>`,
		`<i>${lot.description[locale]}</i>`,
		`⭐ <code>${fmtNum(lot.price)}</code>`,
	].join('\n');
}


export async function showShop(ctx: Context): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user) return;

	const L = t(user.locale);
	const loc = toLocale(user.locale);

	const body = Object.values(LOTS).map(lot => lotLine(lot, loc)).join(`\n\n${LINE}\n\n`);

	const text = [
		L.shop.title,
		'',
		L.shop.intro,
		'',
		LINE,
		'',
		body,
	].join('\n');

	const kb = new InlineKeyboard();
	for (const lot of Object.values(LOTS)) {
		kb.text(`${lot.emoji} ${lot.title[loc]} · ⭐${lot.price}`, `shop:buy:${lot.id}`).row();
	}
	kb.text(L.menu.home, 'nav:home');

	await render(ctx, text, kb);
}


/**
 * Создаёт invoice в Telegram и сам инвойс приходит отдельным сообщением.
 * Существующее меню не трогаем — просто показываем toast.
 */
export async function handleBuy(ctx: Context, lotId: string): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user || !ctx.chat) return;

	const L = t(user.locale);
	const loc = toLocale(user.locale);
	const lot = LOTS[lotId];
	if (!lot) {
		await toast(ctx, L.common.notFound);
		return;
	}

	await toast(ctx, L.shop.processing);

	await ctx.api.sendInvoice(
		ctx.chat.id,
		lot.title[loc],
		lot.description[loc],
		`${lot.id},${user.id}`,
		'XTR',
		[{label: lot.title[loc], amount: lot.price}],
	);
}
