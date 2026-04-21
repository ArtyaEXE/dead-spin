import {InlineKeyboard, type Context} from 'grammy';
import {t} from '../i18n';
import {render} from '../lib/nav';
import {findUserByTgId, getUserStats} from '../lib/user';
import {LINE, fmtNum, statsCard} from '../lib/format';


export async function showProfile(ctx: Context): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user) return;

	const L = t(user.locale);
	const stats = await getUserStats(user.id);
	const since = user.createdAt.toISOString().slice(0, 10);

	const text = [
		L.profile.title,
		'',
		`<b>${user.username}</b>`,
		`${L.profile.since} <code>${since}</code>`,
		'',
		LINE,
		'',
		statsCard({
			fuel: user.fuel,
			summaryStars: stats.summaryStars,
			coins: user.coins,
			levelsCleared: stats.levelsCleared,
		}),
		'',
		LINE,
		'',
		L.profile.tip,
	].join('\n');

	// Плюс: небольшой "achievement" если есть ≥1 пройденный уровень
	const achievementsBlock = stats.levelsCleared > 0
		? `\n\n<blockquote>🎖 ${fmtNum(stats.levelsCleared)} levels · ${fmtNum(stats.summaryStars)} stars</blockquote>`
		: '';

	const kb = new InlineKeyboard()
		.text(L.menu.shop, 'shop:open').text(L.menu.leaderboard, 'lb:1').row()
		.text(L.menu.home, 'nav:home');

	await render(ctx, text + achievementsBlock, kb);
}
