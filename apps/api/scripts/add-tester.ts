import {db, pg} from '../src/db/client';
import {allowlist} from '../src/db/schema';
import {eq, sql} from 'drizzle-orm';


/**
 * Добавляет Telegram-ID в allowlist (выполнять локально с production
 * DATABASE_URL в env, или прямо в Render Shell).
 *
 * Usage:
 *   pnpm --filter @dead-spin/api exec tsx scripts/add-tester.ts 123456789 "alice (alpha tester)"
 *
 * Идемпотентный: повторный запуск с тем же ID обновит note, не упадёт.
 *
 * Узнать TG ID юзера:
 *   - попроси его написать боту @userinfobot — выдаст числовой id;
 *   - либо в твоём боте: добавь временный console.log(ctx.from.id) в /start
 *     и попроси отправить /start.
 */


async function main(): Promise<void> {
	const [tgIdRaw, ...noteParts] = process.argv.slice(2);
	if (!tgIdRaw) {
		console.error('Usage: tsx scripts/add-tester.ts <tg_id> [note]');
		process.exit(1);
	}
	if (!/^\d{1,15}$/.test(tgIdRaw)) {
		console.error('tg_id must be numeric Telegram user id');
		process.exit(1);
	}
	const tgId = tgIdRaw;
	const note = noteParts.join(' ').trim() || 'alpha tester';

	console.log(`Adding ${tgId} to allowlist (${note})…`);

	const existing = await db.select().from(allowlist).where(eq(allowlist.tgId, tgId)).limit(1);
	if (existing.length > 0) {
		await db.update(allowlist)
			.set({note})
			.where(eq(allowlist.tgId, tgId));
		console.log(`Updated existing entry for ${tgId}.`);
	} else {
		await db.insert(allowlist).values({tgId, note, addedAt: sql`now()`});
		console.log(`Inserted new entry for ${tgId}.`);
	}

	const total = await db.select({count: sql<number>`count(*)::int`}).from(allowlist);
	console.log(`Total allowlist size: ${total[0]?.count ?? 0}`);

	await pg.end();
}


main().catch((err) => {
	console.error(err);
	process.exit(1);
});
