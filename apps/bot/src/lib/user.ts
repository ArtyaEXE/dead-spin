import {and, eq, sql, count} from 'drizzle-orm';
import {db, schema} from '../db';
import {env} from '../config';


export type EnsureUserInput = {
	tgId: string;
	username: string;
	locale: string;
};


export type EnsureUserResult =
	| {ok: true; user: typeof schema.users.$inferSelect; isNew: boolean}
	| {ok: false; reason: 'notAllowed'};


/**
 * Находит юзера по tgId, или создаёт нового (если разрешено allowlist-ом).
 * В dev ALLOWLIST_OPEN=1 автоматически добавляет tgId в allowlist —
 * чтобы удобно тестировать бота с разных аккаунтов. В prod allowlist
 * должен заполняться заранее.
 */
export async function ensureUser(input: EnsureUserInput): Promise<EnsureUserResult> {
	const [existing] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.tgId, input.tgId))
		.limit(1);

	if (existing) {
		if (existing.username !== input.username || existing.locale !== input.locale) {
			await db.update(schema.users)
				.set({username: input.username, locale: input.locale, updatedAt: sql`now()`})
				.where(eq(schema.users.id, existing.id));
			return {
				ok: true,
				user: {...existing, username: input.username, locale: input.locale},
				isNew: false,
			};
		}
		return {ok: true, user: existing, isNew: false};
	}

	const [allow] = await db
		.select()
		.from(schema.allowlist)
		.where(eq(schema.allowlist.tgId, input.tgId))
		.limit(1);

	if (!allow) {
		if (env.ALLOWLIST_OPEN === 1) {
			await db.insert(schema.allowlist).values({tgId: input.tgId, note: 'auto (dev)'}).onConflictDoNothing();
		} else {
			return {ok: false, reason: 'notAllowed'};
		}
	}

	const [inserted] = await db.insert(schema.users)
		.values({tgId: input.tgId, username: input.username, locale: input.locale})
		.returning();

	await db.insert(schema.progresses).values({userId: inserted!.id}).onConflictDoNothing();

	return {ok: true, user: inserted!, isNew: true};
}


export async function findUserByTgId(tgId: string) {
	const [user] = await db.select().from(schema.users).where(eq(schema.users.tgId, tgId)).limit(1);
	return user ?? null;
}


export async function getUserStats(userId: string) {
	const [prog] = await db
		.select({summaryStars: schema.progresses.summaryStars})
		.from(schema.progresses)
		.where(eq(schema.progresses.userId, userId))
		.limit(1);

	const [levelsRow] = await db
		.select({n: count()})
		.from(schema.progressLevels)
		.where(eq(schema.progressLevels.userId, userId));

	return {
		summaryStars: prog?.summaryStars ?? 0,
		levelsCleared: Number(levelsRow?.n ?? 0),
	};
}


export async function getUserLevelRecord(userId: string, level: number) {
	const [row] = await db
		.select()
		.from(schema.progressLevels)
		.where(and(
			eq(schema.progressLevels.userId, userId),
			eq(schema.progressLevels.level, level),
		))
		.limit(1);
	return row ?? null;
}
