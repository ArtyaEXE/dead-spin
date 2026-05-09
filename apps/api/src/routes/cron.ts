import {Hono} from 'hono';
import {env} from '../config';
import {runWeeklyDigest} from '../lib/group-digest';
import {runFullFuelPush} from '../lib/fuel-push';
import type {AuthedEnv} from '../middleware/auth';
import {forbidden, notFound} from '../lib/errors';


/**
 * Cron-эндпоинты — внешний планировщик (cron-job.org / GitHub Actions
 * schedule / Render Cron Job на платном плане) бьёт их по расписанию.
 * Без CRON_SECRET в env эти роуты возвращают 503 — это страховка от
 * случайного открытия cron'ов без секрета.
 *
 * Дёргать так:
 *   curl -X POST https://api/cron/weekly-digest \
 *        -H 'X-Cron-Secret: <CRON_SECRET>'
 *
 * Идемпотентность встроена в саму логику (см. group-digest.ts) —
 * чрезмерные срабатывания безопасны.
 */
export const cronRoutes = new Hono<AuthedEnv>();


function checkSecret(headerValue: string | undefined): boolean {
	if (!env.CRON_SECRET) return false;
	if (typeof headerValue !== 'string' || headerValue.length === 0) return false;
	// Constant-time compare.
	if (headerValue.length !== env.CRON_SECRET.length) return false;
	let diff = 0;
	for (let i = 0; i < headerValue.length; i++) {
		diff |= headerValue.charCodeAt(i) ^ env.CRON_SECRET.charCodeAt(i);
	}
	return diff === 0;
}


cronRoutes.post('/weekly-digest', async (c) => {
	if (!env.CRON_SECRET) throw notFound('cronDisabled');
	const secret = c.req.header('x-cron-secret');
	if (!checkSecret(secret)) throw forbidden('cronSecretMismatch');

	const result = await runWeeklyDigest();
	return c.json({ok: true, ...result});
});


/**
 * POST /cron/full-fuel-push — пингует юзеров с полным баком, кто
 * давно не играл. Запускать каждые 30-60 мин (idempotent в окне 24h).
 */
cronRoutes.post('/full-fuel-push', async (c) => {
	if (!env.CRON_SECRET) throw notFound('cronDisabled');
	const secret = c.req.header('x-cron-secret');
	if (!checkSecret(secret)) throw forbidden('cronSecretMismatch');
	if (!env.WEB_APP_URL) {
		return c.json({ok: false, reason: 'WEB_APP_URL not set'});
	}

	const result = await runFullFuelPush({webAppUrl: env.WEB_APP_URL});
	return c.json({ok: true, ...result});
});
