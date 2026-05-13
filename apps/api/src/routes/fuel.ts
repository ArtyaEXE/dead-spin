import {Hono} from 'hono';
import {eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {FUEL_SPEND_MIN, FUEL_SPEND_MAX} from '@dead-spin/shared';
import {db} from '../db/client';
import {users} from '../db/schema';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {badRequest} from '../lib/errors';


export const fuelRoutes = new Hono<AuthedEnv>();


const SpendSchema = z.object({
	amount: z.number().int().min(FUEL_SPEND_MIN).max(FUEL_SPEND_MAX),
});


/**
 * POST /fuel/spend
 * Списывает fuel (с clamp к нулю). Регенерация уже применена requireAuth.
 */
fuelRoutes.post('/spend', requireAuth, async (c) => {
	const user = c.var.user;
	const raw = await c.req.json().catch(() => null);
	const parsed = SpendSchema.safeParse(raw);
	if (!parsed.success) throw badRequest('invalidBody');

	const next = Math.max(0, Math.floor(user.fuel - parsed.data.amount));
	if (next === user.fuel) return c.json({fuel: next});

	await db.update(users)
		.set({
			fuel: next,
			// Расход обнуляет «уже слали push о полном баке» — следующий fill
			// до FUEL_MAX снова станет валидным триггером. Если push не слали
			// (NULL → NULL), сравнение `is distinct from` делает no-op.
			lastFullFuelPushAt: null,
			updatedAt: sql`now()`,
		})
		.where(eq(users.id, user.id));

	return c.json({fuel: next});
});
