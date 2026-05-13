import {and, eq, sql} from 'drizzle-orm';
import {db} from '../db/client';
import {groupStreaks} from '../db/schema';
import {tgSendMessage, tgSetMessageReaction} from './telegram-bot';
import {getPlayThreadId} from './group-thread';


/**
 * Streak'и — сколько дней подряд игрок что-то закрывал в этой беседе.
 * Считаются по UTC-дате (YYYY-MM-DD), чтобы не зависеть от таймзоны
 * клиента. День засчитывается на любой level-complete в группе
 * (не важно, был ли это новый рекорд).
 *
 * Уведомление шлётся при пересечении одного из порогов
 * `MILESTONES = [3, 7, 14, 30, 60, 100]` — и только один раз для каждого
 * (поле `last_notified_milestone`). При reset'е (стрик сломался)
 * `last_notified_milestone` обнуляется.
 */


const MILESTONES = [3, 7, 14, 30, 60, 100] as const;
type Milestone = (typeof MILESTONES)[number];


function todayUtc(): string {
	return new Date().toISOString().slice(0, 10);
}


function dayDiff(a: string, b: string): number {
	const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
	const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
	return Math.round((ta - tb) / 86_400_000);
}


/**
 * Обновляет streak пользователя в чате. Возвращает milestone, если
 * сегодня перешагнули порог в первый раз — caller отправит нотификацию.
 */
export async function updateStreak(args: {
	chatId: number;
	userId: string;
}): Promise<{streak: number; milestone: Milestone | null}> {
	const {chatId, userId} = args;
	const today = todayUtc();

	const [row] = await db.select()
		.from(groupStreaks)
		.where(and(eq(groupStreaks.chatId, chatId), eq(groupStreaks.userId, userId)))
		.limit(1);

	let streak: number;
	let lastNotified: number;
	if (!row) {
		streak = 1;
		lastNotified = 0;
		await db.insert(groupStreaks).values({
			chatId, userId, streakDays: 1, longestStreak: 1,
			lastPlayDate: today, lastNotifiedMilestone: 0,
		});
	} else {
		const diff = dayDiff(today, row.lastPlayDate);
		if (diff === 0) {
			// Уже играл сегодня — стрик не меняется, milestone тоже не повторяется.
			return {streak: row.streakDays, milestone: null};
		}
		if (diff === 1) {
			streak = row.streakDays + 1;
			lastNotified = row.lastNotifiedMilestone;
		} else {
			// Пропустил день и более — стрик с нуля.
			streak = 1;
			lastNotified = 0;
		}
		const longest = Math.max(row.longestStreak, streak);
		await db.update(groupStreaks)
			.set({
				streakDays: streak,
				longestStreak: longest,
				lastPlayDate: today,
				lastNotifiedMilestone: lastNotified,
				updatedAt: sql`now()`,
			})
			.where(and(eq(groupStreaks.chatId, chatId), eq(groupStreaks.userId, userId)));
	}

	// Перешагнули новый порог?
	const milestone = MILESTONES.find(m => streak >= m && m > lastNotified);
	if (milestone === undefined) return {streak, milestone: null};

	await db.update(groupStreaks)
		.set({lastNotifiedMilestone: milestone})
		.where(and(eq(groupStreaks.chatId, chatId), eq(groupStreaks.userId, userId)));

	return {streak, milestone};
}


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


export async function sendStreakNotification(args: {
	chatId: number;
	username: string;
	days: number;
}): Promise<void> {
	const {chatId, username, days} = args;
	const html = `🔥 <b>${escapeHtml(username)}</b> играет ${days} ${pluralizeDays(days)} подряд!`;
	const threadId = await getPlayThreadId(chatId);
	const messageId = await tgSendMessage(chatId, html, threadId);
	if (messageId !== null) await tgSetMessageReaction(chatId, messageId, '🔥');
}


function pluralizeDays(n: number): string {
	const mod10 = n % 10, mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return 'день';
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
	return 'дней';
}
