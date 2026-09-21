import {serve} from '@hono/node-server';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {logger} from 'hono/logger';
import {env, isProd} from './config';
import {ApiError, formatError} from './lib/errors';
import {initSentry, captureException} from './lib/sentry';
import {initAnalytics} from './lib/analytics';
import {authRoutes} from './routes/auth';
import {meRoutes} from './routes/me';
import {progressRoutes} from './routes/progress';
import {leaderboardRoutes} from './routes/leaderboard';
import type {AuthedEnv} from './middleware/auth';


export function createApp() {
	// Sentry инициализируем перед созданием роутов, чтобы любые
	// uncaught внутри них уже летели в Sentry. Без DSN — no-op.
	initSentry();
	// PostHog для product analytics — отдельная штука, тоже env-driven.
	initAnalytics();

	const app = new Hono<AuthedEnv>();

	const origins = env.CORS_ORIGINS === '*'
		? '*'
		: env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);

	app.use('*', logger());
	app.use('*', cors({origin: origins, credentials: origins !== '*'}));

	app.get('/healthz', (c) => c.json({
		ok: true,
		env: env.NODE_ENV,
		version: process.env['RENDER_GIT_COMMIT']?.slice(0, 7) ?? 'dev',
	}));

	app.route('/auth', authRoutes);
	app.route('/me', meRoutes);
	app.route('/progress', progressRoutes);
	app.route('/leaderboard', leaderboardRoutes);

	app.onError((err, c) => {
		// Не флудим в Sentry бизнес-ошибки (400/401/403/404/etc) —
		// шлём только реально неожиданные.
		if (!(err instanceof ApiError)) {
			captureException(err, {
				path: c.req.path,
				method: c.req.method,
			});
		}
		return formatError(c, err);
	});

	app.notFound((c) => c.json({error: 'notFound'}, 404));

	return app;
}


// Запускаем сервер только если это прямой вызов, а не импорт из тестов.
const isDirectRun = import.meta.url.startsWith('file:') &&
	process.argv[1] &&
	import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun || process.env['FORCE_START'] === '1') {
	const app = createApp();
	serve({fetch: app.fetch, port: env.PORT}, ({port}) => {
		console.log(`dead-spin api listening on http://localhost:${port} (${isProd ? 'prod' : 'dev'})`);
	});
}
