import {Hono} from 'hono';
import {eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {TELEGRAM_ID_REGEX} from '@dead-spin/shared';
import {env, isDev, isTestMode} from '../config';
import {db} from '../db/client';
import {users, progresses, allowlist} from '../db/schema';
import {validateInitData} from '../lib/telegram';
import {signUserToken} from '../lib/jwt';
import {badRequest, forbidden} from '../lib/errors';


export const authRoutes = new Hono();


/**
 * POST /auth/telegram
 * body: { initData: string } — реальный вход из Telegram Mini App
 *    OR { tgId: string, password: string } — fake-user для dev/TEST
 *
 * Возвращает { token, user }.
 */
const BodySchema = z.union([
	z.object({initData: z.string().min(1)}),
	z.object({tgId: z.string().regex(TELEGRAM_ID_REGEX), password: z.string().min(4).max(128)}),
]);


authRoutes.post('/telegram', async (c) => {
	// Уникальный correlation-id для трассировки конкретной попытки логина
	// сквозь все шаги. Позволяет связать логи в Render-консоли при разборе
	// ERR_CONNECTION_RESET / неудачных попыток.
	const reqId = Math.random().toString(36).slice(2, 10);
	const t0 = Date.now();
	const userAgent = c.req.header('user-agent') ?? '';
	const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '?';
	console.log(`[auth ${reqId}] START ip=${ip} ua=${userAgent.slice(0, 60)}`);

	try {
		const raw = await c.req.json().catch(() => null);
		if (!raw) {
			console.warn(`[auth ${reqId}] FAIL no/invalid JSON body  ${Date.now() - t0}ms`);
			throw badRequest('invalidBody');
		}
		const parsed = BodySchema.safeParse(raw);
		if (!parsed.success) {
			console.warn(`[auth ${reqId}] FAIL schema  issues=${parsed.error.issues.map(i => i.path.join('.') + ':' + i.message).join('|')}  ${Date.now() - t0}ms`);
			throw badRequest('invalidBody');
		}

		const flow = 'initData' in parsed.data ? 'initData' : 'fake';
		console.log(`[auth ${reqId}] body parsed flow=${flow}`);

		let tgId: string;
		let username: string;
		let locale: string;

		if ('initData' in parsed.data) {
			console.log(`[auth ${reqId}] validating initData (length=${parsed.data.initData.length})`);
			const result = validateInitData(parsed.data.initData, env.TELEGRAM_BOT_TOKEN);
			if (!result.ok) {
				console.warn(`[auth ${reqId}] FAIL initData reason=${result.error}  ${Date.now() - t0}ms`);
				throw badRequest(result.error);
			}
			tgId = result.tgId;
			username = result.username;
			locale = result.locale;
			console.log(`[auth ${reqId}] initData OK tgId=${tgId} username=${username} locale=${locale}`);
		} else {
			if (!(isDev || isTestMode)) {
				console.warn(`[auth ${reqId}] FAIL fake-flow blocked in prod  ${Date.now() - t0}ms`);
				throw forbidden('fakeUserDisabled');
			}
			if (!env.FAKE_USER_PASSWORD || parsed.data.password !== env.FAKE_USER_PASSWORD) {
				console.warn(`[auth ${reqId}] FAIL fake-password mismatch tgId=${parsed.data.tgId}  ${Date.now() - t0}ms`);
				throw forbidden('invalidFakeUser');
			}
			tgId = parsed.data.tgId;
			username = `user_${tgId}`;
			locale = 'en';
			console.log(`[auth ${reqId}] fake-flow OK tgId=${tgId}`);
		}

		// Allowlist
		const [allowRow] = await db.select().from(allowlist).where(eq(allowlist.tgId, tgId)).limit(1);
		console.log(`[auth ${reqId}] allowlist check tgId=${tgId} found=${!!allowRow}`);
		if (!allowRow && !isDev) {
			console.warn(`[auth ${reqId}] FAIL not in allowlist tgId=${tgId}  ${Date.now() - t0}ms`);
			throw forbidden('notInAllowlist');
		}

		// User lookup / upsert
		const existing = await db.select().from(users).where(eq(users.tgId, tgId)).limit(1);
		let userId: string;
		let userPath: 'reused' | 'updated' | 'created';

		if (existing[0]) {
			userId = existing[0].id;
			if (existing[0].username !== username || existing[0].locale !== locale) {
				await db.update(users)
					.set({username, locale, updatedAt: sql`now()`})
					.where(eq(users.id, userId));
				userPath = 'updated';
			} else {
				userPath = 'reused';
			}
		} else {
			const [inserted] = await db.insert(users)
				.values({tgId, username, locale})
				.returning({id: users.id});
			userId = inserted!.id;
			userPath = 'created';
		}
		console.log(`[auth ${reqId}] user ${userPath} userId=${userId}`);

		// progresses upsert (idempotent)
		await db.insert(progresses).values({userId}).onConflictDoNothing();

		// Token
		const token = await signUserToken(userId, tgId);
		const [freshUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

		const ms = Date.now() - t0;
		console.log(`[auth ${reqId}] OK userId=${userId} fuel=${freshUser?.fuel ?? '?'} ${ms}ms`);
		return c.json({token, user: freshUser});
	} catch (err) {
		const ms = Date.now() - t0;
		const isApiError = err && typeof err === 'object' && 'status' in err;
		if (isApiError) {
			// Уже залогировано выше как FAIL — пробрасываем для middleware
			throw err;
		}
		// Неожиданная ошибка (DB упала, Telegram API не ответил, JWT signing crashed)
		console.error(`[auth ${reqId}] CRASH ${ms}ms`, err instanceof Error ? `${err.message}\n${err.stack}` : err);
		throw err;
	}
});
