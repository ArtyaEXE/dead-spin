import {tgSendMessage, tgSetMessageReaction} from './telegram-bot';
import {getPlayThreadId} from './group-thread';


/**
 * Сборка и отправка нотификации в групповую беседу при апдейте рекорда.
 *
 * Тексты дублируются с `apps/bot/src/i18n/{ru,en}.ts` (group.notify.*).
 * Не выношу в shared — i18n у бота свой, его ключи завязаны на UI бота;
 * сюда нужен только узкий subset, и кросс-импорт между сервисами
 * усложнил бы деплой.
 */


export type GroupDiff = {
	/** Этот юзер впервые проходит уровень в этой беседе. */
	isFirstClear: boolean;
	/** Звёзды улучшились (vs прошлый личный результат в этой беседе). */
	starsImproved: boolean;
	/** Время улучшилось при тех же звёздах. */
	timeImproved: boolean;
	newStars: number;
	newTimeMs: number;
	/** Лидер до апдейта (null если ещё никто не проходил). */
	oldLeader: {userId: string; username: string} | null;
	/** Лидер после апдейта. */
	newLeader: {userId: string; username: string};
	/** Сменился ли лидер позиции (включая first-leader case). */
	leaderChanged: boolean;
};


type Locale = 'ru' | 'en';


function fmtTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	const ms3 = ms % 1000;
	return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0').slice(0, 2)}`;
}


function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


type Dict = {
	clear: (name: string, level: number) => string;
	withStars: (stars: number) => string;
	personalBest: (time: string) => string;
	leaderTaken: (newLeader: string, prev: string, level: number) => string;
	firstLeader: (name: string, level: number) => string;
};


const RU: Dict = {
	clear: (name, level) => `🚀 <b>${name}</b> прошёл уровень ${level}`,
	withStars: (s) => ` на ${s}⭐`,
	personalBest: (t) => ` (личный рекорд — ${t})`,
	leaderTaken: (n, p, l) => `👑 <b>${n}</b> скинул <b>${p}</b> с лидерской позиции уровня ${l}!`,
	firstLeader: (n, l) => `👑 <b>${n}</b> — первый лидер уровня ${l}!`,
};

const EN: Dict = {
	clear: (name, level) => `🚀 <b>${name}</b> cleared level ${level}`,
	withStars: (s) => ` with ${s}⭐`,
	personalBest: (t) => ` (PB — ${t})`,
	leaderTaken: (n, p, l) => `👑 <b>${n}</b> kicked <b>${p}</b> off the level ${l} throne!`,
	firstLeader: (n, l) => `👑 <b>${n}</b> — first leader on level ${l}!`,
};


function dict(locale: string): Dict {
	return locale === 'ru' ? RU : EN;
}


export function buildNotificationHtml(args: {
	level: number;
	username: string;
	locale: string;
	diff: GroupDiff;
}): string {
	const {level, diff} = args;
	const name = escapeHtml(args.username);
	const D = dict(args.locale);

	const lines: string[] = [];

	if (diff.isFirstClear || diff.starsImproved) {
		let line = D.clear(name, level);
		if (diff.newStars > 0) line += D.withStars(diff.newStars);
		lines.push(line);
	} else if (diff.timeImproved) {
		lines.push(D.clear(name, level) + D.personalBest(fmtTime(diff.newTimeMs)));
	}

	if (diff.leaderChanged) {
		if (diff.oldLeader && diff.oldLeader.userId !== diff.newLeader.userId) {
			lines.push(D.leaderTaken(name, escapeHtml(diff.oldLeader.username), level));
		} else if (!diff.oldLeader) {
			lines.push(D.firstLeader(name, level));
		}
	}

	return lines.join('\n');
}


/**
 * Подбираем эмодзи-реакцию к нотификации по приоритету:
 *   👑 — первый лидер уровня в этой беседе
 *   🏆 — смена лидера (skin-of-the-throne)
 *   🔥 — первая зачистка с 3⭐
 *   ⚡ — личный рекорд по времени без улучшения звёзд
 * null — без реакции (например просто улучшил время на средний результат).
 */
function pickReactionEmoji(diff: GroupDiff): string | null {
	if (diff.leaderChanged) return diff.oldLeader ? '🏆' : '👑';
	if (diff.isFirstClear && diff.newStars === 3) return '🔥';
	if (!diff.isFirstClear && !diff.starsImproved && diff.timeImproved) return '⚡';
	return null;
}


export async function sendGroupNotification(args: {
	chatId: number;
	level: number;
	username: string;
	locale: string;
	diff: GroupDiff;
}): Promise<void> {
	const html = buildNotificationHtml(args);
	if (!html) return;
	const threadId = await getPlayThreadId(args.chatId);
	const messageId = await tgSendMessage(args.chatId, html, threadId);
	if (messageId === null) return;
	const emoji = pickReactionEmoji(args.diff);
	if (emoji) await tgSetMessageReaction(args.chatId, messageId, emoji);
}
