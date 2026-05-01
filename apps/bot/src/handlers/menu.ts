import {InlineKeyboard, type Context} from 'grammy';
import {env} from '../config';
import {t, toLocale} from '../i18n';
import {render} from '../lib/nav';
import {findUserByTgId, getUserStats} from '../lib/user';
import {LINE, statsCard} from '../lib/format';
import {handlePlayInGroup} from './groups';


/**
 * Главный экран: приветствие + карточка со статами + навигация.
 * Рендерится как по /menu, так и по callback "nav:home".
 */
export async function showMainMenu(ctx: Context): Promise<void> {
	// DM-меню содержит web_app inline-кнопку, которая в группах валится
	// с BUTTON_TYPE_INVALID. В групповом контексте показываем
	// групповое приглашение играть, а не персональный stats-card.
	if (ctx.chat?.type && ctx.chat.type !== 'private') {
		await handlePlayInGroup(ctx);
		return;
	}

	const tgId = String(ctx.from?.id ?? '');
	const user = tgId ? await findUserByTgId(tgId) : null;
	if (!user) {
		// Не должно случиться после /start, но подстрахуемся.
		const text = `${t('en').welcome.title}\n\nSend /start to begin.`;
		await render(ctx, text, new InlineKeyboard());
		return;
	}

	const L = t(user.locale);
	const stats = await getUserStats(user.id);

	const text = [
		L.welcome.title,
		'',
		L.welcome.greeting(user.username),
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
	].join('\n');

	const kb = new InlineKeyboard()
		.webApp(L.menu.play, env.WEB_APP_URL).row()
		.text(L.menu.leaderboard, 'lb:1').text(L.menu.shop, 'shop:open').row()
		.text(L.menu.profile, 'profile:open').text(L.menu.settings, 'settings:open').row();
	// «Добавить в беседу» — Telegram перехватывает t.me/<bot>?startgroup и
	// открывает диалог выбора группы. После выбора пользователь увидит
	// /play в чате и сможет нажать "Старт".
	const botUsername = ctx.me?.username;
	if (botUsername) {
		kb.url(L.group.addedToGroup, `https://t.me/${botUsername}?startgroup=play`).row();
	}
	kb.text(L.menu.help, 'help:open');

	await render(ctx, text, kb);
}
