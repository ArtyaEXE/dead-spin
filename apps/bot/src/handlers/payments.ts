import {eq, sql} from 'drizzle-orm';
import type {Context} from 'grammy';
import {db, schema} from '../db';
import {LOTS} from '../lots';
import {t, toLocale} from '../i18n';


/**
 * Два шага платежа Telegram Stars:
 *   1) pre_checkout_query — клиент перед оплатой просит подтвердить параметры.
 *      Обязаны ответить в течение 10 сек, иначе Telegram отменит.
 *   2) successful_payment — платёж прошёл, зачисляем эффекты.
 *
 * Идемпотентность: тут-же пишем в `payments` с уникальным tg_charge_id.
 * Если второй webhook приедет с тем же charge_id (повторная доставка) —
 * insert провалится, эффект применён не будет. Используем транзакцию.
 */


export async function handlePreCheckout(ctx: Context): Promise<void> {
	const q = ctx.preCheckoutQuery;
	if (!q) return;

	try {
		if (q.currency !== 'XTR') throw new Error('Invalid currency');

		const [lotId, userId] = q.invoice_payload.split(',');
		if (!lotId || !userId) throw new Error('Invalid payload');

		const lot = LOTS[lotId];
		if (!lot) throw new Error('Unknown lot');
		if (q.total_amount !== lot.price) throw new Error('Price mismatch');

		const [user] = await db.select({id: schema.users.id, tgId: schema.users.tgId})
			.from(schema.users)
			.where(eq(schema.users.id, userId))
			.limit(1);
		if (!user || user.tgId !== String(q.from.id)) throw new Error('User mismatch');

		await ctx.answerPreCheckoutQuery(true);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Internal error';
		console.error('pre_checkout_query failed:', msg);
		await ctx.answerPreCheckoutQuery(false, {error_message: msg}).catch(() => {});
	}
}


export async function handleSuccessfulPayment(ctx: Context): Promise<void> {
	const p = ctx.message?.successful_payment;
	if (!p) return;
	if (p.currency !== 'XTR') return;

	const [lotId, userId] = p.invoice_payload.split(',');
	if (!lotId || !userId) return;
	const lot = LOTS[lotId];
	if (!lot) return;
	if (p.total_amount !== lot.price) return;

	try {
		await db.transaction(async (tx) => {
			// Идемпотентность: если такой charge уже был — бросаем, эффект не применяем.
			await tx.insert(schema.payments).values({
				tgChargeId: p.telegram_payment_charge_id,
				userId,
				lotId,
				amount: p.total_amount,
				currency: 'XTR',
			});

			if (lot.effect.type === 'fuel') {
				// Внешний источник — не клампим к FUEL_MAX. Stars-покупка
				// может выкатить юзера сверх потолка; авторегенерация
				// дальше работает только до FUEL_MAX, над-cap копится.
				// `fuel_updated_at` не трогаем — регенерация живёт своим темпом.
				await tx.update(schema.users)
					.set({
						fuel: sql`${schema.users.fuel} + ${lot.effect.amount}`,
						updatedAt: sql`now()`,
					})
					.where(eq(schema.users.id, userId));
			} else if (lot.effect.type === 'coins') {
				await tx.update(schema.users)
					.set({coins: sql`${schema.users.coins} + ${lot.effect.amount}`, updatedAt: sql`now()`})
					.where(eq(schema.users.id, userId));
			}
		});

		const [user] = await db.select({locale: schema.users.locale})
			.from(schema.users).where(eq(schema.users.id, userId)).limit(1);
		const L = t(user?.locale ?? 'en');
		const loc = toLocale(user?.locale);

		await ctx.reply(L.shop.success(lot.title[loc]), {parse_mode: 'HTML'});
	} catch (err) {
		// Вероятнее всего дубликат tg_charge_id — этот платёж уже обработан.
		console.warn('successful_payment: already processed or failed:', err);
	}
}
