import {PostHog} from 'posthog-node';
import {env} from '../config';

/**
 * Серверная аналитика через PostHog. Без ключа — все методы
 * становятся no-op'ами, можно безопасно вызывать `track()` из любого
 * хэндлера. Включится когда добавишь POSTHOG_KEY в env.
 *
 * Какие события полезно слать с сервера (а не из клиента):
 *  - level_complete (фактический результат, не оптимистический)
 *  - purchase (после successful_payment)
 *  - achievement_unlocked
 *  - daily_checkin
 * Это даёт «source of truth» — клиентские события можно подделать,
 * серверные нельзя.
 */

let client: PostHog | null = null;

export function initAnalytics(): void {
	if (!env.POSTHOG_KEY) return;
	client = new PostHog(env.POSTHOG_KEY, {
		host: env.POSTHOG_HOST,
		// Малые batch'и — у нас не такая нагрузка чтобы ждать буферизацию.
		flushAt: 1,
		flushInterval: 0,
	});
	console.log('PostHog analytics initialized');
}

export function track(args: {userId: string; event: string; properties?: Record<string, unknown>}): void {
	if (!client) return;
	client.capture({
		distinctId: args.userId,
		event: args.event,
		properties: args.properties,
	});
}

/** Идентификация юзера — заполняем профиль в PostHog. */
export function identify(args: {userId: string; username: string; locale: string}): void {
	if (!client) return;
	client.identify({
		distinctId: args.userId,
		properties: {
			username: args.username,
			locale: args.locale,
		},
	});
}

export async function shutdownAnalytics(): Promise<void> {
	if (!client) return;
	await client.shutdown();
}
