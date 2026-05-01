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
 * users — игроки. `tg_id` уникален, остальные поля лениво обновляются при
 * логине (username/locale меняются через бот Telegram).
 * `fuel_updated_at` — метка последнего обновления fuel; ленивая регенерация
 * читает эту метку вместо фонового воркера (см. lib/fuel.ts).
 */
export const users = pgTable('users', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	tgId: text('tg_id').notNull(),
	username: text('username').notNull(),
	locale: text('locale').notNull().default('en'),

	fuel: integer('fuel').notNull().default(FUEL_INITIAL),
	fuelUpdatedAt: timestamp('fuel_updated_at', {withTimezone: true}).notNull().defaultNow(),

	coins: integer('coins').notNull().default(0),
	details: integer('details').notNull().default(0),

	createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	tgIdIdx: uniqueIndex('users_tg_id_idx').on(table.tgId),
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
 * payments — Telegram Stars (XTR) платежи; в исходной системе хранились
 * неявно, тут выносим в отдельную таблицу с `tg_charge_id` для
 * идемпотентности.
 */
export const payments = pgTable('payments', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	tgChargeId: text('tg_charge_id').notNull(),
	userId: text('user_id').notNull().references(() => users.id),
	lotId: text('lot_id').notNull(),
	amount: integer('amount').notNull(),
	currency: text('currency').notNull().default('XTR'),
	createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	chargeIdx: uniqueIndex('payments_tg_charge_id_idx').on(table.tgChargeId),
	userIdx: index('payments_user_idx').on(table.userId),
}));


/**
 * allowlist — список Telegram-ID, которым разрешён вход в игру.
 * Заменяет массив `telegram.wl` из Meteor-settings.
 */
export const allowlist = pgTable('allowlist', {
	tgId: text('tg_id').primaryKey(),
	note: text('note').default(''),
	addedAt: timestamp('added_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * editor_admins — кому разрешён доступ к редактору уровней.
 */
export const editorAdmins = pgTable('editor_admins', {
	tgId: text('tg_id').primaryKey().references(() => allowlist.tgId, {onDelete: 'cascade'}),
	addedAt: timestamp('added_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * group_chats — Telegram-беседы, в которые добавили бота. `chat_id` — это
 * настоящий Telegram chat_id (отрицательный для групп/супергрупп). Soft
 * delete через `left_at`: историю не теряем, чтобы при повторном добавлении
 * не плодить дубликаты записей о результатах.
 */
export const groupChats = pgTable('group_chats', {
	chatId: bigint('chat_id', {mode: 'number'}).primaryKey(),
	title: text('title').notNull(),
	type: text('type').notNull(),
	joinedAt: timestamp('joined_at', {withTimezone: true}).notNull().defaultNow(),
	leftAt: timestamp('left_at', {withTimezone: true}),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * group_progress_levels — рекорды per (chat, user, level). Отдельная таблица
 * от progress_levels — у одного игрока могут быть разные «лучшие» в DM
 * (глобальный лидерборд) и в каждой беседе. Индекс под scope-выборку
 * лидерборда: (chat, level, stars desc, time_ms asc).
 */
export const groupProgressLevels = pgTable('group_progress_levels', {
	chatId: bigint('chat_id', {mode: 'number'}).notNull().references(() => groupChats.chatId, {onDelete: 'cascade'}),
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	level: integer('level').notNull(),
	stars: integer('stars').notNull(),
	timeMs: integer('time_ms').notNull(),
	fuelSpent: integer('fuel_spent').notNull(),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.chatId, table.userId, table.level]}),
	starsCheck: check('group_progress_levels_stars_check', sql`${table.stars} between 0 and 3`),
	leaderboardIdx: index('group_progress_levels_leaderboard_idx').on(table.chatId, table.level, table.stars, table.timeMs),
}));


/**
 * group_membership_cache — кэш проверки `getChatMember`, чтобы не дёргать
 * Telegram API на каждый /progress. Юзер считается участником беседы,
 * если запись свежая (TTL ~1 час) и `is_member = 1`.
 */
export const groupMembershipCache = pgTable('group_membership_cache', {
	chatId: bigint('chat_id', {mode: 'number'}).notNull(),
	tgId: text('tg_id').notNull(),
	isMember: integer('is_member').notNull(),
	checkedAt: timestamp('checked_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.chatId, table.tgId]}),
}));


export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Progress = typeof progresses.$inferSelect;
export type NewProgress = typeof progresses.$inferInsert;

export type ProgressLevel = typeof progressLevels.$inferSelect;
export type NewProgressLevel = typeof progressLevels.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

/**
 * group_ghosts — запись прохождения текущего лидера (chat, level). При
 * улучшении лидером (или сменой лидера) запись перезаписывается. Mini App
 * фетчит её на старте уровня и проигрывает translucent-кораблём.
 *
 * `recording` — JSONB по схеме `GhostRecording` из `@dead-spin/shared`.
 */
export const groupGhosts = pgTable('group_ghosts', {
	chatId: bigint('chat_id', {mode: 'number'}).notNull().references(() => groupChats.chatId, {onDelete: 'cascade'}),
	level: integer('level').notNull(),
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	stars: integer('stars').notNull(),
	timeMs: integer('time_ms').notNull(),
	recording: jsonb('recording').$type<GhostRecording>().notNull(),
	recordedAt: timestamp('recorded_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.chatId, table.level]}),
}));


export type GroupChat = typeof groupChats.$inferSelect;
export type NewGroupChat = typeof groupChats.$inferInsert;

export type GroupProgressLevel = typeof groupProgressLevels.$inferSelect;
export type NewGroupProgressLevel = typeof groupProgressLevels.$inferInsert;

export type GroupGhost = typeof groupGhosts.$inferSelect;
export type NewGroupGhost = typeof groupGhosts.$inferInsert;
