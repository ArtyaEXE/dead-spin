import {and, eq, sql} from 'drizzle-orm';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {db} from '../db/client';
import {groupChats} from '../db/schema';
import {tgSendMessage, tgPinChatMessage, tgEditMessageText} from './telegram-bot';


/**
 * Закреплённое сообщение «🏆 Топ беседы». Один на чат, обновляется при
 * каждом изменении лидерборда — у всех участников беседы в шапке
 * актуальная таблица.
 *
 * Lifecycle:
 *  1) Первый рекорд в беседе → `ensurePinnedLeaderboard` отправляет
 *     сообщение, закрепляет (`pinChatMessage`), сохраняет `message_id`
 *     в `group_chats.pinned_message_id`.
 *  2) Все последующие — `editMessageText`. Если ID есть, но edit
 *     возвращает 404 (юзер удалил сообщение) — обнуляем pinned_message_id
 *     и при следующем вызове создадим заново.
 *  3) Если у бота нет прав `can_pin_messages` — сообщение всё равно
 *     уйдёт и будет редактироваться, просто не закреплено. Юзер может
 *     дать админ-права позже.
 *
 * Best-effort: ошибки логируются, но не пробрасываются — это украшение,
 * не критическая логика.
 */


type LeaderboardRow = {username: string; totalStars: number; levelsDone: number; totalTimeMs: number};


function rankPrefix(i: number): string {
	if (i === 0) return '🥇';
	if (i === 1) return '🥈';
	if (i === 2) return '🥉';
	return `${i + 1}.`;
}


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


function buildLeaderboardHtml(rows: readonly LeaderboardRow[]): string {
	if (rows.length === 0) {
		return '🏆 <b>Топ беседы</b>\n\n<i>Пока никто не прошёл ни одного уровня.</i>';
	}

	const lines = rows.map((r, i) => {
		const prefix = rankPrefix(i);
		const name = escapeHtml(r.username);
		return `${prefix} <b>${name}</b>  ${r.totalStars}⭐  <code>${r.levelsDone}/${LEVEL_COUNT}</code>`;
	});

	const updated = new Date().toUTCString().replace(/^.*?, /, '').slice(0, -4);
	return [
		'🏆 <b>Топ беседы</b>',
		'',
		...lines,
		'',
		`<i>Обновлено: ${updated} UTC</i>`,
	].join('\n');
}


async function fetchTop(chatId: number, limit: number = 5): Promise<LeaderboardRow[]> {
	const rows = await db.execute<{
		username: string;
		total_stars: number;
		total_time_ms: number;
		levels_done: number;
	}>(sql`
		select
			u.username,
			coalesce(sum(gpl.stars), 0)::int as total_stars,
			coalesce(sum(gpl.time_ms), 0)::int as total_time_ms,
			count(gpl.level)::int as levels_done
		from group_progress_levels gpl
		inner join users u on u.id = gpl.user_id
		where gpl.chat_id = ${chatId}
		group by u.username
		order by total_stars desc, total_time_ms asc
		limit ${limit}
	`);
	return rows.map(r => ({
		username: r.username,
		totalStars: r.total_stars,
		totalTimeMs: r.total_time_ms,
		levelsDone: r.levels_done,
	}));
}


export async function ensurePinnedLeaderboard(chatId: number): Promise<void> {
	const top = await fetchTop(chatId);
	const html = buildLeaderboardHtml(top);

	const [chat] = await db.select()
		.from(groupChats)
		.where(eq(groupChats.chatId, chatId))
		.limit(1);
	if (!chat) return;

	if (chat.pinnedMessageId !== null && chat.pinnedMessageId !== undefined) {
		const ok = await tgEditMessageText(chatId, chat.pinnedMessageId, html);
		if (ok) return;
		// Edit упал — например, сообщение удалили. Сбрасываем id и создадим
		// новое ниже.
		await db.update(groupChats)
			.set({pinnedMessageId: null, updatedAt: sql`now()`})
			.where(eq(groupChats.chatId, chatId));
	}

	// Создаём заново — в нужной теме форума, если задана.
	const messageId = await tgSendMessage(chatId, html, chat.playThreadId);
	if (messageId === null) return;

	// Пин — best-effort. Если без прав — сообщение останется отправленным,
	// будем его edit'ить дальше, просто не закрепляя. В forum-группе Telegram
	// сам закрепит сообщение в его теме (по message_id), отдельного параметра
	// для thread'а у pinChatMessage нет.
	await tgPinChatMessage(chatId, messageId);

	await db.update(groupChats)
		.set({pinnedMessageId: messageId, updatedAt: sql`now()`})
		.where(eq(groupChats.chatId, chatId));
}
