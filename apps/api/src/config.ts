import {z} from 'zod';


const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().int().positive().default(3001),

	DATABASE_URL: z.string().url(),

	JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 bytes'),

	TELEGRAM_BOT_TOKEN: z.string().default(''),

	TEST: z.coerce.number().int().min(0).max(1).default(0),
	FAKE_USER_PASSWORD: z.string().default(''),

	MONGO_URL: z.string().default(''),

	CORS_ORIGINS: z.string().default('*'),

	/**
	 * Секрет для cron-эндпоинтов (POST /cron/*). Внешний планировщик
	 * (cron-job.org / GitHub Actions / etc.) шлёт его в заголовке
	 * `X-Cron-Secret`. Если пусто — cron-эндпоинты возвращают 503.
	 */
	CRON_SECRET: z.string().default(''),

	/** Sentry DSN. Если пусто — Sentry не инициализируется (no-op). */
	SENTRY_DSN: z.string().default(''),

	/**
	 * PostHog product analytics. Без ключа — no-op. PostHog Cloud
	 * (free 1M events/мес) или self-host. EU-инстанс рекомендуется
	 * по той же причине что и Neon — данные в EU.
	 */
	POSTHOG_KEY: z.string().default(''),
	POSTHOG_HOST: z.string().default('https://eu.i.posthog.com'),

	/**
	 * URL Mini App — для линков в push-нотификациях ("⛽ Полный бак").
	 * Совпадает с WEB_APP_URL в боте. Если пусто — push не уйдёт
	 * (бот пытается слать сообщение со ссылкой, ссылки не будет).
	 */
	WEB_APP_URL: z.string().default(''),
});


export type Env = z.infer<typeof EnvSchema>;


function devDefaults(raw: Record<string, string | undefined>): Record<string, string | undefined> {
	if ((raw['NODE_ENV'] ?? 'development') !== 'development') return raw;
	return {
		DATABASE_URL: 'postgres://deadspin:deadspin@localhost:5432/deadspin',
		JWT_SECRET: 'dev-secret-dev-secret-dev-secret-dev-secret-32b',
		...raw,
	};
}


function parseEnv(): Env {
	const raw = devDefaults(process.env);
	const result = EnvSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues.map(i => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Invalid environment variables:\n${issues}`);
	}
	return result.data;
}


export const env: Env = parseEnv();


export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isTestMode = env.TEST === 1;
