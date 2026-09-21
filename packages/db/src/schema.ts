import {
	pgTable,
	text,
	integer,
	boolean,
	timestamp,
	jsonb,
	primaryKey,
	uniqueIndex,
	index,
	check,
} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import type {GhostRecording, Profile} from '@dead-spin/shared';


/**
 * users — игроки. Идентификация анонимная: `device_id` — UUID, который
 * клиент генерирует при первом запуске и хранит локально. Он уникален и
 * заменяет прежний `tg_id`. Когда появится вход через Apple/Google, их
 * идентификатор ляжет отдельной колонкой рядом, а device_id останется
 * фолбэком для гостевого режима.
 */
export const users = pgTable('users', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	deviceId: text('device_id').notNull(),
	username: text('username').notNull(),
	locale: text('locale').notNull().default('en'),

	/**
	 * Снимок профиля с устройства (GDD §16.2): монеты, скин, туториалы,
	 * дейлик, ачивки. Устройство — источник истины, сервер хранит копию для
	 * восстановления и ничего в ней не пересчитывает. NULL — снимка ещё не было.
	 */
	profile: jsonb('profile').$type<Profile>(),

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
	/** Липкие флаги рейтинга (GDD §9); stars = 1 + parHit + fullClear. */
	parHit: boolean('par_hit').notNull().default(false),
	fullClear: boolean('full_clear').notNull().default(false),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.userId, table.level]}),
	starsCheck: check('progress_levels_stars_check', sql`${table.stars} between 0 and 3`),
	leaderboardIdx: index('progress_levels_leaderboard_idx').on(table.level, table.stars, table.timeMs),
}));



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



// ─── Выводимые типы строк ────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Progress = typeof progresses.$inferSelect;
export type NewProgress = typeof progresses.$inferInsert;

export type ProgressLevel = typeof progressLevels.$inferSelect;
export type NewProgressLevel = typeof progressLevels.$inferInsert;

export type GlobalGhost = typeof globalGhosts.$inferSelect;
export type NewGlobalGhost = typeof globalGhosts.$inferInsert;
