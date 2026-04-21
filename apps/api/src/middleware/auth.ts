import {createMiddleware} from 'hono/factory';
import {eq} from 'drizzle-orm';
import {verifyUserToken} from '../lib/jwt';
import {unauthorized} from '../lib/errors';
import {db} from '../db/client';
import {users, type User} from '../db/schema';
import {regenerateFuelInDb} from '../lib/fuel-db';


export type AuthedEnv = {
	Variables: {
		user: User;
	};
};


/**
 * requireAuth — извлекает JWT из Authorization: Bearer, верифицирует,
 * подтягивает свежего юзера из БД, применяет ленивую регенерацию fuel,
 * и кладёт готовый объект в c.var.user.
 */
export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
	const authHeader = c.req.header('authorization') ?? '';
	const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
	if (!token) throw unauthorized('missingToken');

	const payload = await verifyUserToken(token);
	if (!payload) throw unauthorized('invalidToken');

	const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
	if (!user) throw unauthorized('userNotFound');

	const withFuel = await regenerateFuelInDb(user);
	c.set('user', withFuel);

	await next();
});
