import {InlineKeyboard, type Context} from 'grammy';
import {sql} from 'drizzle-orm';
import {makeGroupStartParam} from '@dead-spin/shared';
import {signGroupContext} from '@dead-spin/shared/group-hmac';
import {db, schema} from '../db';
import {env} from '../config';
import {t, toLocale} from '../i18n';


/**
 * Хэндлер `my_chat_member` — Telegram шлёт это событие при изменении
 * статуса самого бота в чате. Регистрируем/деактивируем запись о беседе.
 *
 *   member|administrator → бот в чате (live)
 *   left|kicked          → бот ушёл (soft-delete через `left_at`)
 *
 * Для приватных чатов событие тоже приходит при /start, но мы фильтруем
 * по `chat.type` — нас интересуют только group/supergroup.
 */
export async function handleMyChatMember(ctx: Context): Promise<void> {
	const upd = ctx.myChatMember;
	if (!upd) return;
	const chat = upd.chat;
	if (chat.type !== 'group' && chat.type !== 'supergroup') return;

	const newStatus = upd.new_chat_member.status;
	const isPresent = newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator';

	if (isPresent) {
		const title = chat.title ?? '(без названия)';
		await db.insert(schema.groupChats)
			.values({chatId: chat.id, title, type: chat.type, leftAt: null})
			.onConflictDoUpdate({
				target: schema.groupChats.chatId,
				set: {title, type: chat.type, leftAt: null, updatedAt: sql`now()`},
			});
	} else {
		await db.update(schema.groupChats)
			.set({leftAt: sql`now()`, updatedAt: sql`now()`})
			.where(sql`${schema.groupChats.chatId} = ${chat.id}`);
	}
}


/**
 * `/play` (или `/play@bot`) в группе — отправляет сообщение с inline-кнопкой,
 * запускающей Mini App с подписанным групповым контекстом. Подпись HMAC
 * привязывает chatId к bot token'у, чтобы клиент не мог подсунуть
 * произвольный chatId в наш API.
 *
 * ВАЖНО про тип кнопки. Telegram отказывает (`BUTTON_TYPE_INVALID`) при
 * `web_app` inline-кнопке в группе — этот тип private-only. Поэтому
 * шлём `url`-кнопку с deep-link'ом `t.me/<bot>?startapp=<param>`, который
 * Telegram сам разворачивает в запуск Main Mini App; `start_param` приходит
 * в `Telegram.WebApp.initDataUnsafe.start_param`. На стороне Mini App это
 * хэндлится в `groupStore.hydrate()` (fallback на initDataUnsafe).
 *
 * Требует, чтобы у бота через @BotFather было настроено Main Mini App —
 * иначе `t.me/<bot>?startapp=` просто откроет диалог с ботом без игры.
 */
export async function handlePlayInGroup(ctx: Context): Promise<void> {
	const chat = ctx.chat;
	if (!chat) return;
	if (chat.type !== 'group' && chat.type !== 'supergroup') return;

	const botUsername = ctx.me?.username;
	if (!botUsername) {
		console.warn('handlePlayInGroup: ctx.me.username unavailable, cannot build deep-link');
		return;
	}

	const locale = toLocale(ctx.from?.language_code ?? 'en');
	const L = t(locale);

	const hmac = signGroupContext(chat.id, env.TELEGRAM_BOT_TOKEN);
	const startParam = makeGroupStartParam(chat.id, hmac);
	const deepLink = `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;

	const kb = new InlineKeyboard().url(L.menu.play, deepLink);

	await ctx.reply(L.group.playInvite, {reply_markup: kb, parse_mode: 'HTML'});
}
