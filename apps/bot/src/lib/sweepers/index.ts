import type {Bot} from 'grammy';
import {env} from '../../config';
import {sweepFullFuelPush} from './full-fuel';
import {sweepReviewPrompt} from './review-prompt';


/**
 * Запускает все периодические DM-нотификации в фоне:
 *   • sweepFullFuelPush — «⛽ Бак полный»
 *   • sweepReviewPrompt — one-time «Понравилась игра? — загляни в чат»
 *
 * Тикает каждые `SWEEPERS_INTERVAL_MS` (5 мин по дефолту). Каждый запуск
 * sweep'ов изолирован в try/catch — упавший один не валит весь tick.
 *
 * Возвращает функцию остановки — вызываем из graceful shutdown.
 */
export function startSweepers(bot: Bot): () => void {
	if (!env.SWEEPERS_ENABLED) {
		console.log('Sweepers disabled (SWEEPERS_ENABLED=0)');
		return () => {};
	}

	const tick = async (): Promise<void> => {
		const now = new Date();
		try {
			const r = await sweepFullFuelPush(bot, now);
			if (r.scanned > 0) console.log(`[sweep:full-fuel] scanned=${r.scanned} sent=${r.sent} failed=${r.failed}`);
		} catch (e) {
			console.error('[sweep:full-fuel] crashed:', e instanceof Error ? e.message : e);
		}
		try {
			const r = await sweepReviewPrompt(bot, now);
			if (r.scanned > 0) console.log(`[sweep:review] scanned=${r.scanned} sent=${r.sent} failed=${r.failed}`);
		} catch (e) {
			console.error('[sweep:review] crashed:', e instanceof Error ? e.message : e);
		}
	};

	// Первый тик — не сразу при старте, а через интервал. Иначе при rolling
	// рестартах деплоев можем дважды пройти по тем же кандидатам в близкое
	// время (старый процесс ещё не выгрузился — Render free даёт ~30 сек).
	const handle = setInterval(() => { void tick(); }, env.SWEEPERS_INTERVAL_MS);
	console.log(`Sweepers started: interval=${env.SWEEPERS_INTERVAL_MS}ms, quietHoursUTC=${env.PUSH_QUIET_HOURS_UTC}`);

	return () => clearInterval(handle);
}
