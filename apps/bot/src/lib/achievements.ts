import {eq, asc} from 'drizzle-orm';
import {ACHIEVEMENTS, ACHIEVEMENT_KEYS, type AchievementKey} from '@dead-spin/shared';
import {db, schema} from '../db';
import type {Locale} from '../i18n';


/**
 * Возвращает множество ключей разблокированных ачивок юзера.
 * Сортируем по дате — на случай если когда-нибудь понадобится «последняя
 * полученная» (сейчас в UI используется как Set).
 */
export async function getUnlockedKeys(userId: string): Promise<Set<AchievementKey>> {
	const rows = await db.select({key: schema.achievements.key})
		.from(schema.achievements)
		.where(eq(schema.achievements.userId, userId))
		.orderBy(asc(schema.achievements.unlockedAt));
	return new Set(rows.map(r => r.key as AchievementKey));
}


/**
 * Рендер сетки ачивок для /me — все 10 в один блок, разлоченные в две
 * колонки. Залоченные показываем с 🔒 и приглушённым названием — это
 * мотивирует вернуться, не превращая профиль в ничем не объясняющий
 * счётчик «3/10».
 */
export function renderAchievementsGrid(args: {
	unlocked: Set<AchievementKey>;
	locale: Locale;
}): string {
	const {unlocked, locale} = args;
	return ACHIEVEMENT_KEYS.map((key) => {
		const meta = ACHIEVEMENTS[key];
		const name = locale === 'ru' ? meta.ru : meta.en;
		if (unlocked.has(key)) {
			return `${meta.emoji} <b>${name}</b>`;
		}
		return `🔒 <i>${name}</i>`;
	}).join('\n');
}
