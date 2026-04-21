import {Hono} from 'hono';
import {requireAuth, type AuthedEnv} from '../middleware/auth';


export const meRoutes = new Hono<AuthedEnv>();

meRoutes.get('/', requireAuth, (c) => {
	const user = c.var.user;
	return c.json({user});
});
