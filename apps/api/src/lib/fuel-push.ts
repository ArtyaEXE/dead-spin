import {and, eq, gte, isNull, lt, or, sql} from 'drizzle-orm';
import {FUEL_MAX} from '@dead-spin/shared';
import {db} from '../db/client';
import {users} from '../db/schema';
import {tgSendMessage} from './telegram-bot';


/**
 * "Полный бак" пуш. Срабатывает для юзеров у которых:
 *   - fuel == FUEL_MAX (regen-метка свежая, бак точно полный)
 *   - был активен относительно недавно (updated_at < 30 дней) — не пушим
 *     давно ушедших, это будет восприниматься как спам
 *   - last_full_fuel_push_at либо NULL, либо старше 24 часов
 *   - последняя активность ≥12 часов назад (если играет прямо сейчас —
 *     не нужно пушить)
 *
 * Cron-эндпоинт `POST /cron/full-fuel-push` запускается через внешний
 * планировщик каждые 30-60 минут. Idempotent — повторный запуск в окне
 * 24h ничего не повторит благодаря last_full_fuel_push_at.
 *
 * Rate-limit Telegram: 30 msg/sec в среднем. Шлём батчами по 25 с
 * паузой 1.1 сек, чтобы укладываться.
 */


const ACTIVE_THRESHOLD_DAYS = 30;
const COOLDOWN_HOURS = 24;
const IDLE_THRESHOLD_HOURS = 12;
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1100;


function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}


export async function runFullFuelPush(args: {
	webAppUrl: string;
}): Promise<{processed: number; sent: number; failed: number}> {
	const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
	const activeCutoff = new Date(Date.now() - ACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
	const idleCutoff = new Date(Date.now() - IDLE_THRESHOLD_HOURS * 60 * 60 * 1000);

	const candidates = await db.select({tgId: users.tgId, id: users.id, locale: users.locale})
		.from(users)
		.where(and(
			gte(users.fuel, FUEL_MAX),
			gte(users.updatedAt, activeCutoff),
			lt(users.updatedAt, idleCutoff),
			or(
				isNull(users.lastFullFuelPushAt),
				lt(users.lastFullFuelPushAt, cooldownCutoff),
			),
		));

	let sent = 0;
	let failed = 0;

	for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
		const batch = candidates.slice(i, i + BATCH_SIZE);
		await Promise.all(batch.map(async (u) => {
			const html = u.locale === 'ru'
				? `⛽ <b>Бак полон</b>\nСамое время продолжить — <a href="${args.webAppUrl}">играть</a>.`
				: `⛽ <b>Tank's full</b>\nGood time to keep going — <a href="${args.webAppUrl}">play</a>.`;
			const messageId = await tgSendMessage(Number(u.tgId), html).catch(() => null);
			if (messageId !== null) {
				sent++;
				await db.update(users)
					.set({lastFullFuelPushAt: sql`now()`})
					.where(eq(users.id, u.id));
			} else {
				failed++;
				// Тоже ставим временную метку — чтобы не дёргать снова сразу.
				// Возможно юзер заблокировал бота → дальше тоже не пройдёт,
				// 24h cooldown сэкономит лишние вызовы.
				await db.update(users)
					.set({lastFullFuelPushAt: sql`now()`})
					.where(eq(users.id, u.id));
			}
		}));
		if (i + BATCH_SIZE < candidates.length) await delay(BATCH_DELAY_MS);
	}

	return {processed: candidates.length, sent, failed};
}
