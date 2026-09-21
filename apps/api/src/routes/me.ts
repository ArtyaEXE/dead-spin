import {Hono} from 'hono';
import {eq, sql} from 'drizzle-orm';
import {ProfileSchema} from '@dead-spin/shared';
import {db} from '../db/client';
import {users} from '../db/schema';
import {badRequest} from '../lib/errors';
import {requireAuth, type AuthedEnv} from '../middleware/auth';

export const meRoutes = new Hono<AuthedEnv>();

meRoutes.get('/', requireAuth, (c) => {
	return c.json({user: c.var.user});
});

/**
 * PUT /me/profile — снимок профиля с устройства (GDD §16.2).
 *
 * Устройство — источник истины: монеты, скин, туториалы, дейлик и ачивки
 * считаются на клиенте (packages/shared/src/profile.ts). Сервер хранит
 * копию для восстановления на другом устройстве и ничего не пересчитывает.
 * Клиент шлёт снимок через очередь синхронизации — при сбое сети он
 * повторится позже, порядок сохраняется.
 */
meRoutes.put('/profile', requireAuth, async (c) => {
	const raw = await c.req.json().catch(() => null);
	const parsed = ProfileSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');

	const userId = c.var.user.id;
	await db.update(users).set({profile: parsed.data, updatedAt: sql`now()`}).where(eq(users.id, userId));
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	return c.json({user});
});
