import {InlineKeyboard, type Bot} from 'grammy';
import {and, eq, isNull, lte, gte, sql} from 'drizzle-orm';
import {FUEL_MAX, FUEL_REGEN_PER_TICK, FUEL_TICK_MS} from '@dead-spin/shared';
import {db, schema} from '../../db';
import {env} from '../../config';
import {t, toLocale} from '../../i18n';
import {isQuietHourUTC} from './quiet-hours';


/**
 * Максимум юзеров за один тик — лимитируем чтобы не флудить Telegram и
 * не блокировать loop надолго. 100 × 50ms ≈ 5 сек на тик, остаток уйдёт
 * в следующий проход через `SWEEPERS_INTERVAL_MS`.
 */
const BATCH_LIMIT = 100;
/** Пауза между send'ами — щадящая, далеко от 30 msg/sec лимита Bot API. */
const SEND_GAP_MS = 50;


/**
 * Находит и нотифицирует юзеров, у которых fuel должен быть >= FUEL_MAX
 * прямо сейчас. Регенерация ленивая, поэтому в `users.fuel` хранится
 * старое число, а текущий уровень считается как
 *   fuel_now = fuel + floor((now - fuel_updated_at) / TICK) * REGEN
 * Условие «полный» в SQL без чтения всех строк:
 *   fuel_updated_at + 10s * ceil((FUEL_MAX - fuel) / REGEN) <= now()
 * Если fuel уже >= FUEL_MAX (over-cap от daily/Stars) — правая часть в
 * прошлом, юзер тоже подходит.
 *
 * Send-once-per-fill: после успешного push'а ставим `last_full_fuel_push_at = now`.
 * Когда юзер начнёт тратить fuel, `/fuel/spend` обнулит это поле обратно,
 * и следующий fill снова станет валидным триггером.
 */
export async function sweepFullFuelPush(bot: Bot, now: Date = new Date()): Promise<{
	scanned: number;
	sent: number;
	skipped: number;
	failed: number;
}> {
	if (isQuietHourUTC(now, env.PUSH_QUIET_HOURS_UTC)) {
		return {scanned: 0, sent: 0, skipped: 0, failed: 0};
	}

	// Полные секунды до бака. CAST на numeric — иначе integer-деление
	// съест дробь у быстро регенерящих маленьких остатков.
	const tickSeconds = FUEL_TICK_MS / 1000;
	const willBeFullAt = sql<Date>`${schema.users.fuelUpdatedAt} + (CEIL((${FUEL_MAX} - ${schema.users.fuel})::numeric / ${FUEL_REGEN_PER_TICK}) * ${tickSeconds}) * INTERVAL '1 second'`;

	const maxAgeCutoff = new Date(now.getTime() - env.PUSH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

	const candidates = await db
		.select({
			id: schema.users.id,
			tgId: schema.users.tgId,
			locale: schema.users.locale,
		})
		.from(schema.users)
		.where(and(
			isNull(schema.users.lastFullFuelPushAt),
			lte(willBeFullAt, now),
			gte(schema.users.updatedAt, maxAgeCutoff),
		))
		.limit(BATCH_LIMIT);

	let sent = 0;
	let failed = 0;
	for (const u of candidates) {
		const L = t(toLocale(u.locale)).push.fullFuel;
		const kb = new InlineKeyboard().url(L.cta, env.WEB_APP_URL);
		const ok = await bot.api.sendMessage(
			u.tgId,
			`${L.title}\n${L.body}`,
			{parse_mode: 'HTML', reply_markup: kb, disable_notification: false},
		).then(() => true).catch((err: Error) => {
			console.warn(`[sweep:full-fuel] sendMessage failed for ${u.tgId}: ${err.message}`);
			return false;
		});

		// Ставим штамп даже при неуспехе: 403 (юзер заблокировал бота) —
		// перманентная ошибка, ретрай не поможет, лучше не долбиться. При
		// удачной отправке сторона ⛽ всё равно сбросит штамп в /fuel/spend.
		await db.update(schema.users)
			.set({lastFullFuelPushAt: sql`now()`})
			.where(eq(schema.users.id, u.id));

		if (ok) sent++;
		else failed++;

		if (SEND_GAP_MS > 0) await new Promise(r => setTimeout(r, SEND_GAP_MS));
	}

	return {scanned: candidates.length, sent, skipped: 0, failed};
}
