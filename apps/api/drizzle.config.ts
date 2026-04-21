import {defineConfig} from 'drizzle-kit';

const databaseUrl = process.env['DATABASE_URL'] ?? 'postgres://deadspin:deadspin@localhost:5432/deadspin';

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: databaseUrl,
	},
	strict: true,
	verbose: true,
});
