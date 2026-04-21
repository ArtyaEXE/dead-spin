import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		include: ['src/**/__tests__/**/*.test.ts'],
		env: {
			NODE_ENV: 'test',
			TELEGRAM_BOT_TOKEN: 'test:token',
			DATABASE_URL: 'postgres://test:test@localhost:5432/test',
			WEB_APP_URL: 'https://example.com',
			BOT_MODE: 'polling',
			ALLOWLIST_OPEN: '1',
		},
	},
});
