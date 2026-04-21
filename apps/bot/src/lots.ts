/**
 * Лоты магазина. Цены — в Telegram Stars (XTR), 1 Star ≈ $0.013.
 *
 * При расширении: добавить запись сюда и создать инвойс с
 * `invoice_payload = "<lotId>,<userId>"`. Обработчик successful_payment
 * прочитает payload и применит эффект.
 */

export type LotEffect =
	| {type: 'fuel'; amount: number}
	| {type: 'coins'; amount: number};

export type Lot = {
	id: string;
	title: Record<'ru' | 'en', string>;
	description: Record<'ru' | 'en', string>;
	price: number; // XTR
	effect: LotEffect;
	emoji: string;
};


export const LOTS: Record<string, Lot> = {
	fuel_small: {
		id: 'fuel_small',
		title: {ru: '+5 000 топлива', en: '+5,000 fuel'},
		description: {ru: 'Быстрая дозаправка', en: 'Quick refill'},
		price: 10,
		effect: {type: 'fuel', amount: 5_000},
		emoji: '⛽',
	},
	fuel_big: {
		id: 'fuel_big',
		title: {ru: '+15 000 топлива', en: '+15,000 fuel'},
		description: {ru: 'Полный бак', en: 'Full tank'},
		price: 25,
		effect: {type: 'fuel', amount: 15_000},
		emoji: '⛽',
	},
	coins_pack: {
		id: 'coins_pack',
		title: {ru: '100 монет', en: '100 coins'},
		description: {ru: 'Для косметики', en: 'For cosmetics'},
		price: 50,
		effect: {type: 'coins', amount: 100},
		emoji: '💰',
	},
};
