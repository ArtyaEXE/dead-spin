import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {db, pg} from '../src/db/client';


async function main(): Promise<void> {
	console.log('Applying Drizzle migrations...');
	await migrate(db, {migrationsFolder: './drizzle'});
	console.log('Migrations applied.');
	await pg.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
