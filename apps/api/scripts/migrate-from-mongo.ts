/**
 * Одноразовый скрипт переноса данных из старой Meteor-Mongo БД в Postgres.
 *
 * Что читается из Mongo:
 *   Users                   → users  (tg_id, username, locale, fuel, coins, details)
 *   Progresses              → progresses (summary_stars) + progress_levels (per-level)
 *
 * Запуск:
 *   MONGO_URL=mongodb://localhost:27017/meteor DATABASE_URL=... pnpm migrate:mongo
 *
 * Скрипт идемпотентен: повторный запуск не создаст дублей (матч по tg_id).
 * Аномалии (пропущенные уровни, отсутствие prev) логируются, но не ломают миграцию.
 */

import {MongoClient} from 'mongodb';
import {eq, sql} from 'drizzle-orm';
import {env} from '../src/config';
import {db, pg} from '../src/db/client';
import {users, progresses, progressLevels} from '../src/db/schema';
import {FUEL_INITIAL} from '@dead-spin/shared';


type MongoUser = {
	_id: string;
	tgId: string;
	username?: string;
	locale?: string;
	fuel?: number;
	coins?: number;
	details?: number;
	createdAt?: Date;
};

type LevelRecord = {stars: number; time: number; fuel: number};

type MongoProgress = {
	_id: string;
	user: string;
	summaryStars?: number;
	levels?: Record<string, LevelRecord>;
};


async function main(): Promise<void> {
	if (!env.MONGO_URL) {
		console.error('MONGO_URL is not set in env. Aborting.');
		process.exit(1);
	}

	console.log(`Connecting to Mongo: ${env.MONGO_URL}`);
	const mongo = new MongoClient(env.MONGO_URL);
	await mongo.connect();
	const src = mongo.db();

	const mongoUsers = await src.collection<MongoUser>('Users').find({}).toArray();
	const mongoProgs = await src.collection<MongoProgress>('Progresses').find({}).toArray();
	console.log(`Loaded ${mongoUsers.length} users, ${mongoProgs.length} progresses from Mongo.`);

	const progByUser = new Map<string, MongoProgress>();
	for (const p of mongoProgs) progByUser.set(p.user, p);

	let usersInserted = 0;
	let usersSkipped = 0;
	let levelsInserted = 0;
	const anomalies: string[] = [];

	for (const mu of mongoUsers) {
		if (!mu.tgId) {
			anomalies.push(`user ${mu._id}: missing tgId`);
			continue;
		}

		const [existing] = await db.select({id: users.id}).from(users).where(eq(users.tgId, mu.tgId)).limit(1);
		let userId: string;

		if (existing) {
			userId = existing.id;
			usersSkipped++;
		} else {
			const [inserted] = await db.insert(users).values({
				tgId: mu.tgId,
				username: mu.username ?? `user_${mu.tgId}`,
				locale: mu.locale ?? 'en',
				fuel: typeof mu.fuel === 'number' ? mu.fuel : FUEL_INITIAL,
				coins: mu.coins ?? 0,
				details: mu.details ?? 0,
			}).returning({id: users.id});
			userId = inserted!.id;
			usersInserted++;
		}

		const mp = progByUser.get(mu._id);
		if (!mp) continue;

		await db.insert(progresses).values({
			userId,
			summaryStars: mp.summaryStars ?? 0,
		}).onConflictDoUpdate({
			target: progresses.userId,
			set: {
				summaryStars: mp.summaryStars ?? 0,
				updatedAt: sql`now()`,
			},
		});

		if (!mp.levels) continue;

		for (const [levelStr, rec] of Object.entries(mp.levels)) {
			const level = Number(levelStr);
			if (!Number.isInteger(level) || level < 1 || level > 1000) {
				anomalies.push(`progress for user ${mu.tgId}: bad level key '${levelStr}'`);
				continue;
			}
			if (typeof rec !== 'object' || rec === null) continue;
			if (!Number.isInteger(rec.stars) || rec.stars < 0 || rec.stars > 3) {
				anomalies.push(`user ${mu.tgId} level ${level}: bad stars ${rec.stars}`);
				continue;
			}

			if (level > 1 && !mp.levels[String(level - 1)]) {
				anomalies.push(`user ${mu.tgId}: level ${level} without level ${level - 1}`);
			}

			await db.insert(progressLevels).values({
				userId,
				level,
				stars: rec.stars,
				timeMs: rec.time ?? 0,
				fuelSpent: rec.fuel ?? 0,
			}).onConflictDoUpdate({
				target: [progressLevels.userId, progressLevels.level],
				set: {
					stars: rec.stars,
					timeMs: rec.time ?? 0,
					fuelSpent: rec.fuel ?? 0,
					updatedAt: sql`now()`,
				},
			});
			levelsInserted++;
		}
	}

	console.log('');
	console.log(`Users: +${usersInserted}, existing: ${usersSkipped}`);
	console.log(`Level records: ${levelsInserted}`);
	if (anomalies.length) {
		console.log(`\nAnomalies (${anomalies.length}):`);
		for (const a of anomalies) console.log(`  - ${a}`);
	}

	await mongo.close();
	await pg.end();
}


main().catch((err) => {
	console.error(err);
	process.exit(1);
});
