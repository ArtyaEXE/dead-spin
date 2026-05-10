/**
 * Метаданные 10 ачивок (emoji + локализованные названия).
 *
 * Живут в shared, потому что нужны и API (выдача через unlockAchievement,
 * см. apps/api/src/lib/achievements.ts), и боту (рендер сетки в /me).
 *
 * Условия выдачи и SQL остаются в API — это server-only логика.
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


export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS) as AchievementKey[];
