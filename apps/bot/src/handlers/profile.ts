import {InlineKeyboard, type Context} from 'grammy';
import {ACHIEVEMENT_KEYS} from '@dead-spin/shared';
import {t, toLocale} from '../i18n';
import {render} from '../lib/nav';
import {findUserByTgId, getUserStats} from '../lib/user';
import {LINE, statsCard} from '../lib/format';
import {getUnlockedKeys, renderAchievementsGrid} from '../lib/achievements';


export async function showProfile(ctx: Context): Promise<void> {
	const tgId = String(ctx.from?.id ?? '');
	const user = await findUserByTgId(tgId);
	if (!user) return;

	const L = t(user.locale);
	const loc = toLocale(user.locale);
	const stats = await getUserStats(user.id);
	const since = user.createdAt.toISOString().slice(0, 10);
	const unlocked = await getUnlockedKeys(user.id);

	const achievementsBlock = unlocked.size > 0
		? [
			L.profile.achievementsTitle,
			L.profile.achievementsCount(unlocked.size, ACHIEVEMENT_KEYS.length),
			'',
			renderAchievementsGrid({unlocked, locale: loc}),
		].join('\n')
		: [L.profile.achievementsTitle, '', L.profile.achievementsEmpty].join('\n');

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
			labels: L.card,
		}),
		'',
		LINE,
		'',
		achievementsBlock,
		'',
		LINE,
		'',
		L.profile.tip,
	].join('\n');

	const kb = new InlineKeyboard()
		.text(L.menu.shop, 'shop:open').text(L.menu.leaderboard, 'lb:1').row()
		.text(L.menu.home, 'nav:home');

	await render(ctx, text, kb);
}
