import * as Sentry from '@sentry/browser';


/**
 * Опциональная инициализация Sentry в Mini App. DSN приходит из env
 * `VITE_SENTRY_DSN`. Если пусто — функция не делает ничего, и
 * `captureException` тоже становится no-op'ом. Это значит можно
 * безопасно звать `initSentry()` всегда; включится когда добавишь
 * DSN в env при build/deploy.
 */


let enabled = false;


export function initSentry(): void {
	const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
	if (!dsn) return;
	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		release: __APP_VERSION__,
		tracesSampleRate: 0,
		sendDefaultPii: false,
	});
	enabled = true;
	console.log('Sentry initialized');
}


export function captureException(err: unknown, context?: Record<string, unknown>): void {
	if (!enabled) return;
	Sentry.captureException(err, context ? {extra: context} : undefined);
}
