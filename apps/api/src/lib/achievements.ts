import {eq, sql} from 'drizzle-orm';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {db} from '../db/client';
import {achievements} from '../db/schema';
import {tgSendMessage, tgSetMessageReaction} from './telegram-bot';
import {track} from './analytics';


/**
 * 10 базовых ачивок. Названия и иконки — пара русско-английских строк
 * для нотификации, плюс ключ для БД.
 *
 * Detection-логика встраивается в level-complete (шесть из этих десяти),
 * в shop (one — all skins), и в group-streaks (one — week_streak).
 *
 * Получить можно только один раз каждую — повторное unlockAchievement
 * с тем же ключом тихо no-op'нется (PK constraint).
 */


export const ACHIEVEMENTS = {
	first_clear: {
		emoji: '🚀',
		ru: 'Первая победа',
		en: 'First clear',
	},
	first_3stars: {
		emoji: '⭐',
		ru: 'Идеальный заход',
		en: 'Perfect run',
	},
	all_levels: {
		emoji: '🏁',
		ru: 'Картограф',
		en: 'Cartographer',
	},
	all_3stars: {
		emoji: '🏆',
		ru: 'Звёздный картограф',
		en: 'Star cartographer',
	},
	speedrunner: {
		emoji: '⚡',
		ru: 'Спидраннер',
		en: 'Speedrunner',
	},
	fuel_efficient: {
		emoji: '💨',
		ru: 'Экономист',
		en: 'Fuel-efficient',
	},
	all_skins: {
		emoji: '👨‍🚀',
		ru: 'Коллекционер',
		en: 'Collector',
	},
	week_streak: {
		emoji: '🔥',
		ru: 'Неделя в строю',
		en: 'Week strong',
	},
	first_duel_win: {
		emoji: '👊',
		ru: 'Первый победный поединок',
		en: 'First duel win',
	},
	bot_in_group: {
		emoji: '👥',
		ru: 'Социальный гонщик',
		en: 'Social racer',
	},
} as const;


export type AchievementKey = keyof typeof ACHIEVEMENTS;


/**
 * Выдаёт ачивку, если ещё не выдана. Возвращает true только при
 * фактической первой выдаче — чтобы caller знал отправлять ли
 * нотификацию. Best-effort: ошибка не пробрасывается дальше.
 */
export async function unlockAchievement(args: {
	userId: string;
	key: AchievementKey;
	notify?: boolean;
	tgId?: string;
	locale?: string;
}): Promise<boolean> {
	const {userId, key} = args;
	try {
		// onConflictDoNothing — атомарный «выдать если ещё нет».
		const inserted = await db.insert(achievements)
			.values({userId, key})
			.onConflictDoNothing()
			.returning();

		const isNew = inserted.length > 0;
		if (!isNew) return false;

		track({userId, event: 'achievement_unlocked', properties: {key}});

		if (args.notify && args.tgId) {
			const a = ACHIEVEMENTS[key];
			const locale = args.locale ?? 'en';
			const text = locale === 'ru'
				? `${a.emoji} <b>Достижение</b>\n«${a.ru}»`
				: `${a.emoji} <b>Achievement</b>\n«${a.en}»`;
			const messageId = await tgSendMessage(Number(args.tgId), text);
			if (messageId !== null) await tgSetMessageReaction(Number(args.tgId), messageId, a.emoji);
		}

		return true;
	} catch (e) {
		console.warn('unlockAchievement failed:', e instanceof Error ? e.message : e);
		return false;
	}
}


/**
 * Проверяет batch-условия после level-complete и выдаёт релевантные
 * ачивки. Условия эвалуируются через прямые SQL-запросы (быстро
 * на нашем масштабе).
 */
export async function evaluateAchievementsAfterLevelComplete(args: {
	userId: string;
	tgId: string;
	locale: string;
	level: number;
	stars: number;
	timeMs: number;
	fuelSpent: number;
}): Promise<void> {
	const {userId, tgId, locale} = args;
	const ctx = {tgId, locale, notify: true};

	// first_clear — первое прохождение любого уровня.
	void unlockAchievement({userId, key: 'first_clear', ...ctx});

	// first_3stars — первое 3⭐.
	if (args.stars === 3) {
		void unlockAchievement({userId, key: 'first_3stars', ...ctx});
	}

	// speedrunner — пройти любой уровень быстрее 10 секунд.
	if (args.timeMs < 10_000) {
		void unlockAchievement({userId, key: 'speedrunner', ...ctx});
	}

	// fuel_efficient — пройти уровень с ≤300 топлива (3 буста или меньше).
	if (args.fuelSpent <= 300 && args.stars >= 1) {
		void unlockAchievement({userId, key: 'fuel_efficient', ...ctx});
	}

	// all_levels / all_3stars / all_skins — после каждого level-complete
	// пересчитываем агрегаты. Дешёвый запрос без JOIN'а.
	//
	// `total_stars` нужен для all_skins: последний скин (asteroid-king)
	// открывается на 45⭐ — это и есть условие «коллекционер всех скинов».
	// Хардкод порога: пороги скинов живут в apps/game/src/stores/skin.ts
	// (game-data, не shared); если будем добавлять новые скины — синхро
	// надо сделать руками. Всего 5 скинов с порогами 0/8/20/35/45.
	const [agg] = await db.execute<{cleared: number; perfect: number; total_stars: number}>(sql`
		select
			count(*)::int as cleared,
			count(*) filter (where stars = 3)::int as perfect,
			coalesce(sum(stars), 0)::int as total_stars
		from progress_levels
		where user_id = ${userId}
	`);
	if (agg) {
		if (agg.cleared >= LEVEL_COUNT) {
			void unlockAchievement({userId, key: 'all_levels', ...ctx});
		}
		if (agg.perfect >= LEVEL_COUNT) {
			void unlockAchievement({userId, key: 'all_3stars', ...ctx});
		}
		if (agg.total_stars >= 45) {
			void unlockAchievement({userId, key: 'all_skins', ...ctx});
		}
	}
}


/** Список разблокированных ачивок юзера, сортировка по дате. */
export async function listUserAchievements(userId: string): Promise<Array<{key: string; unlockedAt: Date}>> {
	return await db.select({key: achievements.key, unlockedAt: achievements.unlockedAt})
		.from(achievements)
		.where(eq(achievements.userId, userId))
		.orderBy(achievements.unlockedAt);
}
