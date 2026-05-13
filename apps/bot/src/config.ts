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

	/**
	 * Ссылка на публичную группу сообщества — куда зовём в one-time
	 * review-prompt. По умолчанию — официальный чат @dead_spin_chat;
	 * можно переопределить через env. Если пусто, sweeper использует
	 * FEEDBACK_URL как фолбэк.
	 */
	COMMUNITY_URL: z.string().default('https://t.me/dead_spin_chat'),

	/**
	 * Главный рубильник фоновых sweep-задач (full-fuel push, review-prompt).
	 * 1 — крутятся, 0 — спят. В тестах/локально удобно держать 0.
	 */
	SWEEPERS_ENABLED: z.coerce.number().int().min(0).max(1).default(1),

	/**
	 * Интервал sweep-tick'а. По умолчанию 5 мин. Один и тот же тик прогоняет
	 * обе функции — full-fuel и review-prompt. Меньше 60s ставить не стоит:
	 * упрёмся в Telegram rate-limit при росте базы.
	 */
	SWEEPERS_INTERVAL_MS: z.coerce.number().int().min(60_000).default(5 * 60_000),

	/**
	 * Тихие часы для push'ей в UTC, формат "HH-HH" (например "22-10").
	 * Если now-час попадает в окно — не шлём, отложим до следующего тика.
	 * Окно через полночь обрабатывается (start > end → внутри если час >= start ИЛИ < end).
	 */
	PUSH_QUIET_HOURS_UTC: z.string().regex(/^\d{1,2}-\d{1,2}$/).default('22-7'),

	/**
	 * Сколько звёзд игрок должен набрать прежде чем мы решим что он
	 * «достаточно поиграл» и можно слать review-prompt. 5 ≈ 2–3 пройденных
	 * уровня с 1+ звездой.
	 */
	REVIEW_PROMPT_MIN_STARS: z.coerce.number().int().min(0).default(5),

	/**
	 * Сколько минут «тишины» (без обновлений `users.updatedAt`) должно
	 * пройти прежде чем шлём review-prompt — чтобы не дёргать игрока
	 * прямо посреди сессии.
	 */
	REVIEW_PROMPT_IDLE_MIN: z.coerce.number().int().min(5).default(60),

	/**
	 * Максимальный возраст активности для всех push'ей: если юзер не
	 * заходил больше N дней, не шлём — он churn, спам только испортит UX.
	 */
	PUSH_MAX_AGE_DAYS: z.coerce.number().int().min(1).default(14),
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
