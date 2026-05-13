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

	/** Когда последний раз шлали "⛽ полный бак" пуш — чтобы не спамить чаще раза в сутки. */
	lastFullFuelPushAt: timestamp('last_full_fuel_push_at', {withTimezone: true}),
	/**
	 * Когда отправили one-time DM «Понравилась игра? — оставь отзыв». NULL —
	 * не слали. После отправки заполняется навсегда; больше не дёргаем
	 * этого юзера сами. Триггер — sweepReviewPrompt() в боте.
	 */
	reviewPromptSentAt: timestamp('review_prompt_sent_at', {withTimezone: true}),
	/** Telegram-id юзера, который пригласил этого юзера. NULL если регистрация органическая. */
	referrerId: text('referrer_id'),
	/**
	 * Выбранный скин ракеты — id из stores/skin.ts SKINS. Применяется
	 * глобально, но если в текущем контексте (DM или конкретной беседе)
	 * звёзд не хватает на этот скин, клиент рисует prospector. До этого
	 * выбор хранился в localStorage и терялся между девайсами/чисткой;
	 * теперь — навсегда per-user.
	 */
	selectedSkin: text('selected_skin').notNull().default('prospector'),
	/**
	 * Просмотренные туториал-карточки в DM-контексте. Раньше в
	 * localStorage (`dead-spin.tutorials.seen.v3`), но терялось между
	 * устройствами/чистками. Per-group аналог — `user_group_tutorials`.
	 * Ключи: 'controls' | 'mine' | 'stone' | 'worm' (см. ui/Tutorial.tsx).
	 */
	seenTutorials: text('seen_tutorials').array().notNull().default(sql`'{}'::text[]`),

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
 * group_chats — Telegram-беседы, в которые добавили бота. `chat_id` — это
 * настоящий Telegram chat_id (отрицательный для групп/супергрупп). Soft
 * delete через `left_at`: историю не теряем, чтобы при повторном добавлении
 * не плодить дубликаты записей о результатах.
 */
export const groupChats = pgTable('group_chats', {
	chatId: bigint('chat_id', {mode: 'number'}).primaryKey(),
	title: text('title').notNull(),
	type: text('type').notNull(),
	/** ID закреплённого сообщения с live-таблицей лидеров. NULL — ещё не создавали. */
	pinnedMessageId: integer('pinned_message_id'),
	/** Кастомное имя «команды» беседы — задаётся /setname админом. */
	nickname: text('nickname'),
	/** Эмодзи-аватар команды (1 графема) — задаётся /setemoji. */
	emoji: text('emoji'),
	/** Когда последний раз отправляли weekly digest в этот чат. NULL = никогда. */
	lastDigestAt: timestamp('last_digest_at', {withTimezone: true}),
	joinedAt: timestamp('joined_at', {withTimezone: true}).notNull().defaultNow(),
	leftAt: timestamp('left_at', {withTimezone: true}),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
});


/**
 * user_group_skins — выбранный скин юзера В КОНКРЕТНОЙ беседе. PK
 * (user_id, chat_id). Если строки нет — выбор не делался, клиент по
 * умолчанию рисует prospector в этом чате. Это per-context override
 * над `users.selected_skin` (который — DM-выбор).
 *
 * Идея: юзер может в DM играть VETERAN'ом (заработал 35★ глобально),
 * а в группе с 0★ играть PROSPECTOR'ом — чистый старт «персоны»
 * в каждом чате. Если в группе наберёт 8★ и тапнет WANDERER'а в магазине,
 * запись сюда сохранит WANDERER именно для этого чата, не трогая DM-выбор.
 */
export const userGroupSkins = pgTable('user_group_skins', {
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	chatId: bigint('chat_id', {mode: 'number'}).notNull().references(() => groupChats.chatId, {onDelete: 'cascade'}),
	selectedSkin: text('selected_skin').notNull().default('prospector'),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.userId, table.chatId]}),
}));


/**
 * user_group_tutorials — просмотренные туториал-карточки в КОНКРЕТНОЙ
 * беседе. Per-group аналог `users.seen_tutorials`. PK (user_id, chat_id).
 *
 * Идея: в каждой беседе игрок проходит онбординг с нуля — controls,
 * mine, stone, worm заново. Это согласуется с тем что прогресс и
 * скины тоже per-chat: новая беседа = новая «персона», по-новой.
 */
export const userGroupTutorials = pgTable('user_group_tutorials', {
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	chatId: bigint('chat_id', {mode: 'number'}).notNull().references(() => groupChats.chatId, {onDelete: 'cascade'}),
	seenTutorials: text('seen_tutorials').array().notNull().default(sql`'{}'::text[]`),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.userId, table.chatId]}),
}));


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
 * group_streaks — счётчик дней подряд, что игрок играл в этой беседе.
 * Обновляется на каждый level-complete в группе:
 *   today === last_play_date    → no-op
 *   today === last_play_date+1  → streak += 1
 *   else                         → streak = 1
 * `longest_streak` хранится для возможной будущей плашки «личный рекорд».
 * `last_notified_milestone` — последний уже-озвученный порог (3/7/14/30),
 * чтобы не дублировать «🔥 7 дней подряд» при последующих апдейтах в тот
 * же день.
 */
export const groupStreaks = pgTable('group_streaks', {
	chatId: bigint('chat_id', {mode: 'number'}).notNull().references(() => groupChats.chatId, {onDelete: 'cascade'}),
	userId: text('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	streakDays: integer('streak_days').notNull().default(1),
	longestStreak: integer('longest_streak').notNull().default(1),
	lastPlayDate: text('last_play_date').notNull(),
	lastNotifiedMilestone: integer('last_notified_milestone').notNull().default(0),
	updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => ({
	pk: primaryKey({columns: [table.chatId, table.userId]}),
}));


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

export type GroupStreak = typeof groupStreaks.$inferSelect;
export type NewGroupStreak = typeof groupStreaks.$inferInsert;


/**
 * group_challenges — дуэль 1×1 на конкретном уровне в беседе.
 * Создаётся командой `/challenge @user N`. Обе стороны играют тот же
 * уровень в течение 24 часов; кто соберёт больше звёзд (тай-брейк —
 * меньшее время) — победил. Бот апдейтит то же сообщение
 * `message_id` с итогом, чтобы не плодить флуд в чате.
 *
 * Жизненный цикл (state machine):
 *  - pending_accept: инициатор создал, оппонент ещё не нажал «принять».
 *    `expires_at` = created+30мин (окно принятия).
 *  - active: оппонент принял, идёт час игры. `accepted_at` заполнен,
 *    `expires_at` пересчитан = accepted+1ч. Оба могут играть много раз —
 *    в зачёт идёт ЛУЧШИЙ заход (звёзды DESC, время ASC).
 *  - completed: окно игры закрылось, есть итог (оба сыграли, или один
 *    сыграл — победа по дефолту).
 *  - declined: оппонент нажал «отказаться» до принятия.
 *  - cancelled: инициатор нажал «отменить» до принятия.
 *  - expired_no_accept: окно принятия закрылось (никто не нажал).
 *  - expired_no_play: окно игры закрылось, никто из двух не играл.
 *
 * Уровень — рандом из тех, где оба имеют запись в group_progress_levels;
 * обновлять стало нельзя — челлендж для конкретного уровня.
 *
 * Recording'и — challenger_recording / challengee_recording хранят ghost
 * лучшего захода каждого. Пока оппонент не сыграл — ghost не показывается
 * (это решение по дизайну, см. spec челленджей 2026-05-10).
 */
export const groupChallenges = pgTable('group_challenges', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	chatId: bigint('chat_id', {mode: 'number'}).notNull().references(() => groupChats.chatId, {onDelete: 'cascade'}),
	level: integer('level').notNull(),
	challengerUserId: text('challenger_user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	challengeeUserId: text('challengee_user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
	challengerStars: integer('challenger_stars'),
	challengerTimeMs: integer('challenger_time_ms'),
	challengeeStars: integer('challengee_stars'),
	challengeeTimeMs: integer('challengee_time_ms'),
	challengerRecording: jsonb('challenger_recording'),
	challengeeRecording: jsonb('challengee_recording'),
	messageId: integer('message_id'),
	status: text('status').notNull().default('pending_accept'),
	createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
	acceptedAt: timestamp('accepted_at', {withTimezone: true}),
	expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
	resolvedAt: timestamp('resolved_at', {withTimezone: true}),
}, (table) => ({
	pendingIdx: index('group_challenges_pending_idx').on(table.chatId, table.level, table.status),
	// Для проверки «один активный челлендж на юзера» — частые запросы
	// «есть ли у юзера X активный/pending челлендж в любом чате».
	challengerStatusIdx: index('group_challenges_challenger_status_idx').on(table.challengerUserId, table.status),
	challengeeStatusIdx: index('group_challenges_challengee_status_idx').on(table.challengeeUserId, table.status),
}));


export type GroupChallenge = typeof groupChallenges.$inferSelect;
export type NewGroupChallenge = typeof groupChallenges.$inferInsert;

export type DailyReward = typeof dailyRewards.$inferSelect;
export type NewDailyReward = typeof dailyRewards.$inferInsert;


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


export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
