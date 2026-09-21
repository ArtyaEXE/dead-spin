import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		include: ['src/**/__tests__/**/*.test.ts'],
		env: {
			NODE_ENV: 'test',
			DATABASE_URL: 'postgres://test:test@localhost:5432/test',
			JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
			CORS_ORIGINS: '*',
		},
	},
});
