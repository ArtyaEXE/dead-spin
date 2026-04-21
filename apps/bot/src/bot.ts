import {Bot} from 'grammy';
import {env} from './config';
import {handleStart} from './handlers/start';
import {showMainMenu} from './handlers/menu';
import {showProfile} from './handlers/profile';
import {showShop, handleBuy} from './handlers/shop';
import {showLeaderboard} from './handlers/leaderboard';
import {showHelp} from './handlers/help';
import {showSettings, setLocale} from './handlers/settings';
import {handlePreCheckout, handleSuccessfulPayment} from './handlers/payments';
import {toast} from './lib/nav';


export function createBot(): Bot {
	const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

	// Команды
	bot.command('start', handleStart);
	bot.command(['menu', 'home'], showMainMenu);
	bot.command('help', showHelp);
	bot.command('shop', showShop);

	// Навигация из callback_data
	bot.callbackQuery('nav:home', showMainMenu);
	bot.callbackQuery('profile:open', showProfile);
	bot.callbackQuery('shop:open', showShop);
	bot.callbackQuery('help:open', showHelp);
	bot.callbackQuery('settings:open', showSettings);
	bot.callbackQuery('noop', (ctx) => toast(ctx, ''));

	bot.callbackQuery(/^lb:(\d+)$/, async (ctx) => {
		const level = Number(ctx.match[1]);
		await showLeaderboard(ctx, level);
	});

	bot.callbackQuery(/^shop:buy:(.+)$/, async (ctx) => {
		await handleBuy(ctx, ctx.match[1] ?? '');
	});

	bot.callbackQuery(/^settings:locale:(ru|en)$/, async (ctx) => {
		const loc = ctx.match[1] === 'ru' ? 'ru' : 'en';
		await setLocale(ctx, loc);
	});

	// Платежи
	bot.on('pre_checkout_query', handlePreCheckout);
	bot.on('message:successful_payment', handleSuccessfulPayment);

	// Фолбэк для неизвестных callback_query — убираем спиннер, не падаем.
	bot.on('callback_query:data', async (ctx) => {
		await ctx.answerCallbackQuery().catch(() => {});
	});

	// Глобальный error-handler
	bot.catch((err) => {
		console.error('Bot error:', err.error);
	});

	return bot;
}
