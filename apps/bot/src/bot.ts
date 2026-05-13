import {Bot} from 'grammy';
import {eq} from 'drizzle-orm';
import {env} from './config';
import {db, schema} from './db';
import {isThreadAllowed, parseCommandName} from './lib/restrict-thread';
import {handleStart} from './handlers/start';
import {showMainMenu} from './handlers/menu';
import {showProfile} from './handlers/profile';
import {showShop, handleBuy} from './handlers/shop';
import {showLeaderboard} from './handlers/leaderboard';
import {showHelp} from './handlers/help';
import {showSettings, setLocale} from './handlers/settings';
import {handlePreCheckout, handleSuccessfulPayment} from './handlers/payments';
import {handleMyChatMember, handlePlayInGroup, handleNewChatMembers} from './handlers/groups';
import {handleGroupLeaderboard, handleGroupMe, handleGroupBest} from './handlers/group-stats';
import {handleSetName, handleSetEmoji, handleSetPlay} from './handlers/group-identity';
import {handleChallenge, handleAcceptCallback, handleDeclineCallback, handleCancelCallback} from './handlers/challenge';
import {handleResetCommand, handleResetConfirm, handleResetCancel} from './handlers/reset';
import {handleFeedback} from './handlers/feedback';
import {handleInlineQuery} from './handlers/inline';
import {toast} from './lib/nav';


export function createBot(): Bot {
	const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

	// Авто-уборка /-команд в группах: после того как handler ответил —
	// удаляем сообщение юзера, чтобы не копился спам тех-команд (/play, /lb,
	// /me, /best и т.п.). Best-effort: если бот не админ или нет права
	// `can_delete_messages` — Telegram вернёт 400, мы тихо проглатываем.
	// В DM ничего не удаляем — там уборка не нужна, бот общается тет-а-тет.
	bot.use(async (ctx, next) => {
		await next();
		const msg = ctx.message;
		if (!msg || !msg.text || !msg.text.startsWith('/')) return;
		if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') return;
		await ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {/* noop */});
	});

	// Гейтинг команд по теме форума. Если в группе админ выставил
	// `play_thread_id` (см. /setplay), команды из других тем (включая
	// General) игнорим и удаляем — чтобы /play, /lb и прочее не засирали
	// темы «Идеи» / «Баги». Исключение: `/setplay` всегда работает,
	// иначе администратор, ошибившись с темой, не смог бы перенастроить.
	// В DM и в группах без настроенной темы — никаких ограничений.
	bot.use(async (ctx, next) => {
		const msg = ctx.message;
		if (!msg?.text || !msg.text.startsWith('/')) return next();
		if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') return next();

		const command = parseCommandName(msg.text);
		// SELECT play_thread_id для этой беседы. Один лёгкий запрос на
		// команду — для alpha-нагрузки приемлемо; кэш заведём, если
		// начнёт мозолить глаза в профайле.
		const [row] = await db
			.select({playThreadId: schema.groupChats.playThreadId})
			.from(schema.groupChats)
			.where(eq(schema.groupChats.chatId, ctx.chat.id))
			.limit(1);

		const allowed = isThreadAllowed({
			configuredThread: row?.playThreadId ?? null,
			msgThread: msg.message_thread_id ?? null,
			command,
		});
		if (allowed) return next();

		// Молча гасим команду: уборочный middleware выше всё равно
		// попытается её удалить (его вызов в afterware-ветке).
		// Дублирующий delete тут не нужен — он бесплатный, но избыточный.
		return; // не пускаем к handler'ам
	});

	// Команды
	bot.command('start', handleStart);
	bot.command(['menu', 'home'], showMainMenu);
	bot.command('help', showHelp);
	bot.command('shop', showShop);
	bot.command('play', handlePlayInGroup);
	// Групповые stat-команды — действуют только в group/supergroup.
	bot.command(['lb', 'leaderboard'], handleGroupLeaderboard);
	bot.command('me', handleGroupMe);
	bot.command('best', handleGroupBest);
	bot.command('setname', handleSetName);
	bot.command('setemoji', handleSetEmoji);
	bot.command('setplay', handleSetPlay);
	bot.command('challenge', handleChallenge);
	bot.command('reset', handleResetCommand);
	bot.command('feedback', handleFeedback);
	bot.callbackQuery('reset:yes', handleResetConfirm);
	bot.callbackQuery('reset:no', handleResetCancel);

	// Challenge: accept/decline/cancel — id в callback_data.
	bot.callbackQuery(/^ch:accept:(.+)$/, async (ctx) => {
		await handleAcceptCallback(ctx, ctx.match[1] ?? '');
	});
	bot.callbackQuery(/^ch:decline:(.+)$/, async (ctx) => {
		await handleDeclineCallback(ctx, ctx.match[1] ?? '');
	});
	bot.callbackQuery(/^ch:cancel:(.+)$/, async (ctx) => {
		await handleCancelCallback(ctx, ctx.match[1] ?? '');
	});

	// Бот добавлен/удалён из беседы — регистрируем/деактивируем чат для
	// группового лидерборда.
	bot.on('my_chat_member', handleMyChatMember);
	// Новый участник вошёл в беседу — приветствуем (skip ботов).
	bot.on('message:new_chat_members', handleNewChatMembers);

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

	// Inline-режим: @bot в любом чате → выдаёт карточки с топ-рекордами
	// юзера и deep-link'ом для шеринга.
	bot.on('inline_query', handleInlineQuery);

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
