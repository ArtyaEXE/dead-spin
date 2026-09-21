import {fileURLToPath} from 'node:url';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {db, pg} from '../src/db/client';

// Папка миграций — относительно этого файла, а не CWD: скрипт запускается
// и как scripts/migrate-db.ts (dev), и как dist/migrate.js (прод, tsup).
// В обоих случаях ../drizzle указывает на apps/api/drizzle.
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

async function main(): Promise<void> {
	console.log(`Applying Drizzle migrations from ${migrationsFolder}...`);
	await migrate(db, {migrationsFolder});
	console.log('Migrations applied.');
	await pg.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
