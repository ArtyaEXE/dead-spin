import {createServer} from 'node:http';
import {webhookCallback} from 'grammy';
import {env, isDev} from './config';
import {createBot} from './bot';


async function main(): Promise<void> {
	const bot = createBot();
	await bot.init();
	console.log(`Bot @${bot.botInfo.username} is ready (${isDev ? 'dev' : 'prod'})`);

	// Глобальный catch для всех ошибок в хендлерах — иначе падающий update
	// убивает поллинг и сервис уходит в Exit 1.
	bot.catch((err) => {
		console.error('Bot handler error:', err.error);
		console.error('Update:', err.ctx.update);
	});

	if (env.BOT_MODE === 'polling') {
		// КРИТИЧНО: если до этого деплой был в webhook-режиме, у Telegram
		// зарегистрирован URL, и getUpdates вернёт 409 Conflict. Сбрасываем
		// webhook перед стартом long-polling.
		try {
			await bot.api.deleteWebhook({drop_pending_updates: false});
		} catch (e) {
			console.warn('deleteWebhook failed (likely no webhook was set):', e instanceof Error ? e.message : e);
		}
		// В polling-режиме бот не слушает входящие HTTP запросы. На бесплатных
		// хостингах (Render free web service) обязательно listen на PORT —
		// иначе сервис помечается как нездоровый. Поднимаем минимальный
		// HTTP-сервер только с /healthz. В dev без PORT — серверу не стартуем.
		const httpPort = Number(process.env['PORT']);
		if (Number.isFinite(httpPort) && httpPort > 0) {
			const server = createServer((req, res) => {
				if (req.url === '/healthz') {
					res.writeHead(200, {'content-type': 'application/json'});
					res.end(JSON.stringify({ok: true, mode: 'polling'}));
					return;
				}
				res.writeHead(404).end();
			});
			server.listen(httpPort, () => console.log(`Health server on :${httpPort}`));
		}

		await bot.start({
			onStart: () => console.log('Polling updates from Telegram...'),
		});
		return;
	}

	// prod: webhook. grammy сам проверит secret-token в заголовке.
	const handle = webhookCallback(bot, 'http', {
		secretToken: env.WEBHOOK_SECRET,
	});

	const server = createServer(async (req, res) => {
		try {
			if (req.url === '/tg/webhook' && req.method === 'POST') {
				await handle(req, res);
				return;
			}
			if (req.url === '/healthz') {
				res.writeHead(200, {'content-type': 'application/json'});
				res.end(JSON.stringify({ok: true}));
				return;
			}
			res.writeHead(404).end();
		} catch (err) {
			console.error(err);
			if (!res.headersSent) res.writeHead(500).end();
		}
	});

	server.listen(env.WEBHOOK_PORT, () => {
		console.log(`Webhook server on :${env.WEBHOOK_PORT} (path: /tg/webhook)`);
	});

	await bot.api.setWebhook(env.WEBHOOK_URL, {
		secret_token: env.WEBHOOK_SECRET,
		drop_pending_updates: false,
		// `my_chat_member` нужен для регистрации беседы при добавлении бота.
		// Без явного allowed_updates Telegram сохраняет предыдущее значение —
		// если webhook ставился до фичи групп, my_chat_member не приходил бы.
		allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'my_chat_member'],
	});
	console.log(`Webhook set to ${env.WEBHOOK_URL}`);
}


main().catch((err) => {
	console.error('Bot failed to start:', err);
	process.exit(1);
});
