import * as Sentry from '@sentry/node';
import {env} from '../config';


/**
 * Опциональная инициализация Sentry. Если `SENTRY_DSN` не задан — функция
 * становится no-op'ом, и `captureException` тоже ничего не делает. Так мы
 * можем спокойно вызвать `initSentry()` при старте даже без настроенного
 * аккаунта Sentry; включится только когда добавишь DSN в env.
 */


let enabled = false;


export function initSentry(): void {
	if (!env.SENTRY_DSN) return;
	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: env.NODE_ENV,
		release: process.env['RENDER_GIT_COMMIT']?.slice(0, 7) ?? 'dev',
		tracesSampleRate: 0,
		// PII шлём по минимуму — только сообщение и stack-trace.
		sendDefaultPii: false,
	});
	enabled = true;
	console.log('Sentry initialized');
}


export function captureException(err: unknown, context?: Record<string, unknown>): void {
	if (!enabled) return;
	Sentry.captureException(err, context ? {extra: context} : undefined);
}
