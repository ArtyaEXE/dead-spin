import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@dead-spin/db';
import {env, isDev} from './config';


const client = postgres(env.DATABASE_URL, {
	max: 5,
	idle_timeout: 20,
	prepare: false,
});


export const db = drizzle(client, {schema, logger: isDev});
export {client as pg};
export {schema};
