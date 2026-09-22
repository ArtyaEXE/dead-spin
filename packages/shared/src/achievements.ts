/**
 * Метаданные 7 ачивок (emoji + локализованные названия).
 *
 * Живут в shared, потому что нужны и API (выдача через unlockAchievement,
 * см. apps/api/src/lib/achievements.ts), и клиенту (экран достижений).
 *
 * Условия выдачи и SQL остаются в API — это server-only логика.
 */
export const ACHIEVEMENTS = {
	first_clear: {
		emoji: '🚀',
		icon: '/icons/ach-first-clear.svg',
		ru: 'Первая победа',
		en: 'First clear',
	},
	first_3stars: {
		emoji: '⭐',
		icon: '/icons/ach-first-3stars.svg',
		ru: 'Идеальный заход',
		en: 'Perfect run',
	},
	all_levels: {
		emoji: '🏁',
		icon: '/icons/ach-all-levels.svg',
		ru: 'Картограф',
		en: 'Cartographer',
	},
	all_3stars: {
		emoji: '🏆',
		icon: '/icons/ach-all-3stars.svg',
		ru: 'Звёздный картограф',
		en: 'Star cartographer',
	},
	speedrunner: {
		emoji: '⚡',
		icon: '/icons/ach-speedrunner.svg',
		ru: 'Спидраннер',
		en: 'Speedrunner',
	},
	fuel_efficient: {
		emoji: '💨',
		icon: '/icons/ach-fuel-efficient.svg',
		ru: 'Экономист',
		en: 'Fuel-efficient',
	},
	all_skins: {
		emoji: '👨‍🚀',
		icon: '/icons/ach-all-skins.svg',
		ru: 'Коллекционер',
		en: 'Collector',
	},
} as const;

export type AchievementKey = keyof typeof ACHIEVEMENTS;

export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS) as AchievementKey[];
