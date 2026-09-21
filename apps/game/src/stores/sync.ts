import {createStore} from 'zustand/vanilla';
import {z} from 'zod';
import {ProfileSchema, GhostRecordingSchema, type Profile} from '@dead-spin/shared';
import {api, ApiError, getToken} from '../net/client';
import {authStore} from './auth';
import {loadJson, saveJson} from '../lib/persist';

/**
 * Очередь отложенной синхронизации (GDD §16.2). Устройство — источник
 * истины; всё, что нужно донести до сервера, кладётся сюда и уходит,
 * когда есть сеть и токен. Раньше результат уровня терялся молча при
 * любом сбое сети — теперь он лежит в очереди до успешной отправки.
 *
 * Порядок сохраняется: операции уходят строго по одной. Снимков профиля
 * в очереди всегда не больше одного — последний.
 */

const KEY = 'dead-spin.sync.v1';
/** После сбоя не долбим сервер чаще, чем раз в это время. */
const RETRY_AFTER_MS = 10_000;
/** Фоновый тик на случай, если событий online/visibility не было. */
const TICK_MS = 30_000;

const LevelCompleteOp = z.object({
	id: z.string(),
	kind: z.literal('levelComplete'),
	body: z.object({
		level: z.number().int(),
		collected: z.number().int(),
		timeMs: z.number().int(),
		fuelSpent: z.number().int(),
		recording: GhostRecordingSchema.optional(),
	}),
});
const ProfileOp = z.object({
	id: z.string(),
	kind: z.literal('profile'),
	body: ProfileSchema,
});
const OpSchema = z.discriminatedUnion('kind', [LevelCompleteOp, ProfileOp]);
const QueueSchema = z.array(OpSchema);

type Op = z.infer<typeof OpSchema>;
type LevelCompleteBody = z.infer<typeof LevelCompleteOp>['body'];

type SyncState = {
	queue: Op[];
	flushing: boolean;
	lastFailAt: number;
	enqueueLevelComplete: (body: LevelCompleteBody) => void;
	enqueueProfile: (profile: Profile) => void;
	flush: () => Promise<void>;
	init: () => void;
};

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const syncStore = createStore<SyncState>((set, get) => {
	const persist = (queue: Op[]): void => {
		set({queue});
		saveJson(KEY, queue);
	};

	return {
		queue: loadJson(KEY, QueueSchema, () => []),
		flushing: false,
		lastFailAt: 0,

		enqueueLevelComplete(body) {
			persist([...get().queue, {id: newId(), kind: 'levelComplete', body}]);
			void get().flush();
		},

		enqueueProfile(profile) {
			// Держим только последний снимок — предыдущие уже неактуальны.
			const rest = get().queue.filter((op) => op.kind !== 'profile');
			persist([...rest, {id: newId(), kind: 'profile', body: profile}]);
			void get().flush();
		},

		async flush() {
			const s = get();
			if (s.flushing || s.queue.length === 0) return;
			if (Date.now() - s.lastFailAt < RETRY_AFTER_MS) return;

			if (!getToken()) {
				// Нет учётки — сначала логинимся; после успеха App вызовет flush.
				const a = authStore.getState();
				if (a.status !== 'loading') void a.login();
				return;
			}

			set({flushing: true});
			try {
				while (get().queue.length > 0) {
					const op = get().queue[0]!;
					try {
						if (op.kind === 'levelComplete') await api.levelComplete(op.body);
						else await api.putProfile(op.body);
						persist(get().queue.slice(1));
					} catch (e) {
						// 4xx (кроме 401) — операция не станет валидной, выбрасываем,
						// чтобы не блокировать очередь. Сеть, 5xx и 401 — ждём.
						if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
							console.warn(`[sync] drop ${op.kind}: ${e.code}`);
							persist(get().queue.slice(1));
							continue;
						}
						set({lastFailAt: Date.now()});
						break;
					}
				}
			} finally {
				set({flushing: false});
			}
		},

		init() {
			const kick = (): void => {
				void get().flush();
			};
			window.addEventListener('online', kick);
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') kick();
			});
			window.setInterval(kick, TICK_MS);
			kick();
		},
	};
});
