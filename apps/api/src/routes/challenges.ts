import {Hono} from 'hono';
import {requireAuth, type AuthedEnv} from '../middleware/auth';
import {getActiveForUser, sweepExpired} from '../lib/group-challenges';
import {db} from '../db/client';
import {groupChats} from '../db/schema';
import {eq} from 'drizzle-orm';


export const challengesRoutes = new Hono<AuthedEnv>();


/**
 * GET /challenges/active — состояние единственного активного/pending
 * челленджа текущего юзера. Mini App дёргает на старте и периодически,
 * чтобы:
 *  - показать индикатор-баннер в главном меню;
 *  - подсветить нужный уровень в Levels-экране;
 *  - заменить leader-ghost на opponent-ghost при заходе в нужный уровень.
 *
 * Возвращает 200 с null в `challenge`, если ничего активного — это
 * не ошибка, юзер просто свободен.
 *
 * Lazy expiry sweep вызывается до выборки — даём юзеру свежее состояние
 * (например, 30-min accept-окно только что истекло — клиент не покажет
 * висящий «pending», увидит что его уже нет).
 */
challengesRoutes.get('/active', requireAuth, async (c) => {
	// Глобальный sweep дешёвый (фильтр по expires_at < now()), но всё же
	// делаем его best-effort — не валим запрос если что-то пойдёт не так.
	void sweepExpired().catch((e) => console.warn('sweepExpired failed:', e instanceof Error ? e.message : e));

	const data = await getActiveForUser(c.var.user.id);
	if (!data) return c.json({challenge: null});

	// Подгрузим title чата для UI (баннер показывает "челлендж в [chat]").
	const [chat] = await db.select({title: groupChats.title})
		.from(groupChats)
		.where(eq(groupChats.chatId, data.chatId))
		.limit(1);

	return c.json({
		challenge: {
			id: data.id,
			chatId: data.chatId,
			chatTitle: chat?.title ?? null,
			level: data.level,
			status: data.status,
			role: data.role,
			opponentUsername: data.opponentUsername,
			expiresAt: data.expiresAt.toISOString(),
			acceptedAt: data.acceptedAt ? data.acceptedAt.toISOString() : null,
			myStars: data.myStars,
			myTimeMs: data.myTimeMs,
			opponentStars: data.opponentStars,
			opponentTimeMs: data.opponentTimeMs,
			opponentRecording: data.opponentRecording,
		},
	});
});
