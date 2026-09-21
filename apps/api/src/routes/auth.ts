import {Hono} from 'hono';
import {eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '../db/client';
import {users, progresses} from '../db/schema';
import {signUserToken} from '../lib/jwt';
import {badRequest} from '../lib/errors';


export const authRoutes = new Hono();


/**
 * POST /auth/device
 * body: { deviceId: uuid, locale?: string }
 *
 * Анонимный вход. `deviceId` — UUID, который клиент генерирует при первом
 * запуске и хранит локально (см. apps/game/src/stores/auth.ts). Экрана
 * логина нет: игра заводит аккаунт молча и сразу пускает играть.
 *
 * Пароля нет намеренно — устройство и есть учётка. Это гостевой режим:
 * когда появится вход через Apple/Google, их идентификатор ляжет рядом
 * отдельной колонкой, а этот путь останется фолбэком.
 *
 * Возвращает { token, user }.
 */
const BodySchema = z.object({
	deviceId: z.string().uuid(),
	locale: z.string().min(2).max(16).optional(),
});


/** Ник по умолчанию — читаемый и стабильный для конкретного устройства. */
function defaultUsername(deviceId: string): string {
	return `pilot_${deviceId.replace(/-/g, '').slice(0, 6)}`;
}


authRoutes.post('/device', async (c) => {
	const t0 = Date.now();

	const raw = await c.req.json().catch(() => null);
	const parsed = raw ? BodySchema.safeParse(raw) : null;
	if (!parsed?.success) throw badRequest('invalidBody');

	const {deviceId} = parsed.data;
	const locale = parsed.data.locale ?? 'en';

	const [existing] = await db.select().from(users)
		.where(eq(users.deviceId, deviceId))
		.limit(1);

	let userId: string;

	if (existing) {
		userId = existing.id;
		if (existing.locale !== locale) {
			await db.update(users)
				.set({locale, updatedAt: sql`now()`})
				.where(eq(users.id, userId));
		}
	} else {
		const [inserted] = await db.insert(users)
			.values({deviceId, username: defaultUsername(deviceId), locale})
			.returning({id: users.id});
		userId = inserted!.id;
	}

	// progresses upsert — идемпотентно
	await db.insert(progresses).values({userId}).onConflictDoNothing();

	const token = await signUserToken(userId);
	const [freshUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	console.log(`[auth] ${existing ? 'reused' : 'created'} userId=${userId} ${Date.now() - t0}ms`);
	return c.json({token, user: freshUser});
});
