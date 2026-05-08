import {z} from 'zod';


const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

	TELEGRAM_BOT_TOKEN: z.string().min(10, 'TELEGRAM_BOT_TOKEN is required'),
	DATABASE_URL: z.string().url(),
	WEB_APP_URL: z.string().url(),

	BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
	WEBHOOK_URL: z.string().default(''),
	WEBHOOK_SECRET: z.string().default(''),
	WEBHOOK_PORT: z.coerce.number().int().positive().default(3002),

	ALLOWLIST_OPEN: z.coerce.number().int().min(0).max(1).default(0),

	/**
	 * Куда тестеры пишут баги — публичная ссылка (t.me/chat, t.me/username,
	 * https://github.com/.../issues). Если пусто — команда `/feedback` и
	 * UI-кнопка просто скрываются.
	 */
	FEEDBACK_URL: z.string().default(''),
});


export type Env = z.infer<typeof EnvSchema>;


function parseEnv(): Env {
	const result = EnvSchema.safeParse(process.env);
	if (!result.success) {
		const issues = result.error.issues.map(i => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
		throw new Error(`Invalid bot environment:\n${issues}`);
	}

	if (result.data.BOT_MODE === 'webhook') {
		if (!result.data.WEBHOOK_URL) throw new Error('WEBHOOK_URL is required for BOT_MODE=webhook');
		if (!result.data.WEBHOOK_SECRET) throw new Error('WEBHOOK_SECRET is required for BOT_MODE=webhook');
	}

	return result.data;
}


export const env: Env = parseEnv();
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
