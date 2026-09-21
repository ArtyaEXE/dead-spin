import {
	pgTable,
	text,
	integer,
	bigint,
	timestamp,
	jsonb,
	primaryKey,
	uniqueIndex,
	index,
	check,
} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {FUEL_INITIAL, type GhostRecording} from '@dead-spin/shared';


/**
 * users — игроки. Идентификация анонимная: `device_id` — UUID, который
 * клиент генерирует при первом запуске и хранит локально. Он уникален и
 * заменяет прежний `tg_id`. Когда появится вход через Apple/Google, их
 * идентификатор ляжет отдельной колонкой рядом, а device_id останется
 * фолбэком для гостевого режима.
 * `fuel_updated_at` — метка последнего обновления fuel; ленивая регенерация
 * читает эту метку вместо фонового воркера (см. lib/fuel.ts).
 */
export const users = pgTable('users', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	deviceId: text('device_id').notNull(),
	username: text('username').notNull(),
	locale: text('locale').notNull().default('en'),

	fuel: integer('fuel').notNull().default(FUEL_INITIAL),
	fuelUpdatedAt: timestamp('fuel_updated_at', {withTimezone: true}).notNull().defaultNow(),

	coins: integer('coins').notNull().default(0),
	details: integer('details').notNull().default(0),

	/**
	 * Выбранный скин ракеты — id из stores/skin.ts SKINS. Если звёзд не
	 * хватает на этот скин, клиент рисует prospector.
	 */
	selectedSkin: text('selected_skin').notNull().default('prospector'),
	/**
	 * Просмотренные туториал-карточки.
	 * Ключи: 'controls' | 'mine' | 'stone' | 'worm' (см. ui/Tutorial.tsx).
	 */
	seenTutorials: text('seen_tutorials').array().notNull().default(sql`'{}'::text[]`),

	createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	deviceIdIdx: uniqueIndex('users_device_id_idx').on(table.deviceId),
}));


/**
 * progresses — агрегат по юзеру (сейчас только summary звёзд).
 */
export const progresses = pgTable('progresses', {
	userId: text('user_id').primaryKey().references(() => users.id, {onDelete: 'cascade'}),
	summaryStars: integer('summary_stars').notNull().default(0),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * progress_levels — результат прохождения уровня: лучший рекорд игрока.
 * Primary key (user_id, level) — один рекорд на пару.
 * Индекс по (level, stars desc, time_ms asc) — основа лидерборда.
 */
export const progressLevels = pgTable('progress_levels', {
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	level: integer('level').notNull(),
	stars: integer('stars').notNull(),
	timeMs: integer('time_ms').notNull(),
	fuelSpent: integer('fuel_spent').notNull(),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.userId, table.level]}),
	starsCheck: check('progress_levels_stars_check', sql`${table.stars} between 0 and 3`),
	leaderboardIdx: index('progress_levels_leaderboard_idx').on(table.level, table.stars, table.timeMs),
}));


/**
 * daily_rewards — daily login bonus per юзер. UTC-дата по аналогии со
 * стриками. Стрик копит за подряд-играющих, на пропуске сбрасывается.
 *
 * Награды (фиксированный rotation по дням стрика):
 *   1 → 500 fuel
 *   2 → 1000 fuel
 *   3 → 25 coins
 *   4 → 2000 fuel
 *   5 → 50 coins
 *   6 → 3000 fuel
 *   7+ → 100 coins (повторяется)
 */
export const dailyRewards = pgTable('daily_rewards', {
	userId: text('user_id').primaryKey().references(() => users.id, {onDelete: 'cascade'}),
	streakDays: integer('streak_days').notNull().default(1),
	longestStreak: integer('longest_streak').notNull().default(1),
	lastClaimDate: text('last_claim_date').notNull(),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * global_ghosts — запись прохождения глобального лидера уровня. Один row
 * на level. Обновляется при каждом level-complete, если побит глобальный
 * рекорд (stars DESC, timeMs ASC). Mini App в single-режиме фетчит
 * запись и проигрывает translucent-кораблём.
 */
export const globalGhosts = pgTable('global_ghosts', {
	level: integer('level').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	stars: integer('stars').notNull(),
	timeMs: integer('time_ms').notNull(),
	recording: jsonb('recording').$type<GhostRecording>().notNull(),
	recordedAt: timestamp('recorded_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * achievements — глобальные ачивки игрока. Уникальный (user_id, key).
 * Список ключей — `apps/api/src/lib/achievements.ts`. Раз получили —
 * остаются навсегда (нет revoke). Бот шлёт нотификацию в DM при
 * первой выдаче.
 */
export const achievements = pgTable('achievements', {
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	key: text('key').notNull(),
	unlockedAt: timestamp('unlocked_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.userId, table.key]}),
}));


// ─── Выводимые типы строк ────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Progress = typeof progresses.$inferSelect;
export type NewProgress = typeof progresses.$inferInsert;

export type ProgressLevel = typeof progressLevels.$inferSelect;
export type NewProgressLevel = typeof progressLevels.$inferInsert;

export type DailyReward = typeof dailyRewards.$inferSelect;
export type NewDailyReward = typeof dailyRewards.$inferInsert;

export type GlobalGhost = typeof globalGhosts.$inferSelect;
export type NewGlobalGhost = typeof globalGhosts.$inferInsert;

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
