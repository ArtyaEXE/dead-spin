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
	const raw = await c.req.json().catch(() => null);
	const parsed = BodySchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');

	let tgId: string;
	let username: string;
	let locale: string;

	if ('initData' in parsed.data) {
		const result = validateInitData(parsed.data.initData, env.TELEGRAM_BOT_TOKEN);
		if (!result.ok) throw badRequest(result.error);
		tgId = result.tgId;
		username = result.username;
		locale = result.locale;
	} else {
		if (!(isDev || isTestMode)) throw forbidden('fakeUserDisabled');
		if (!env.FAKE_USER_PASSWORD || parsed.data.password !== env.FAKE_USER_PASSWORD) {
			throw forbidden('invalidFakeUser');
		}
		tgId = parsed.data.tgId;
		username = `user_${tgId}`;
		locale = 'en';
	}

	// Allowlist: если таблица пустая в dev — пускаем всех; в prod обязательна.
	const [allowRow] = await db.select().from(allowlist).where(eq(allowlist.tgId, tgId)).limit(1);
	if (!allowRow && !isDev) throw forbidden('notInAllowlist');

	// Upsert юзера: первый вход создаёт запись + пустой прогресс одним батчем.
	const existing = await db.select().from(users).where(eq(users.tgId, tgId)).limit(1);
	let userId: string;

	if (existing[0]) {
		userId = existing[0].id;
		if (existing[0].username !== username || existing[0].locale !== locale) {
			await db.update(users)
				.set({username, locale, updatedAt: sql`now()`})
				.where(eq(users.id, userId));
		}
	} else {
		const [inserted] = await db.insert(users)
			.values({tgId, username, locale})
			.returning({id: users.id});
		userId = inserted!.id;
	}
	// Гарантируем строку в progresses для ЛЮБОГО логина — старые юзеры могли
	// её не получить (баг в предыдущей версии создавал строку только для
	// новых users). Без этой строки UPDATE summary_stars в level-complete
	// тихо ничего не делает и GET /progress всегда возвращает 0.
	await db.insert(progresses).values({userId}).onConflictDoNothing();

	const token = await signUserToken(userId, tgId);
	const [freshUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	return c.json({token, user: freshUser});
});
