import {z} from 'zod';
import {ACHIEVEMENT_KEYS, type AchievementKey} from './achievements';
import {LEVEL_COUNT} from './constants';

/**
 * Профиль игрока — то, что живёт на устройстве и является источником
 * истины (GDD §16.2). Сервер получает снимок целиком через PUT /me/profile
 * и хранит его как есть — для восстановления на другом устройстве; ничего
 * в нём не пересчитывает.
 *
 * Прогресс по уровням в профиль не входит: у него своя таблица и своё
 * слияние (rating.ts / mergeRecord).
 *
 * Вся логика здесь чистая — одинаково работает на клиенте и в тестах.
 */

export const SKIN_IDS = ['prospector', 'wanderer', 'engineer', 'veteran', 'asteroid-king'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

/**
 * Пороги ★ для скинов — единый источник для магазина и ачивки all_skins
 * (GDD §12.2). Раньше дублировались хардкодом в двух местах.
 */
export const SKIN_STAR_THRESHOLDS: Record<SkinId, number> = {
	prospector: 0,
	wanderer: 12,
	engineer: 30,
	veteran: 55,
	'asteroid-king': 85,
};
export const ALL_SKINS_STARS = Math.max(...Object.values(SKIN_STAR_THRESHOLDS));

export const TUTORIAL_KEYS = ['controls', 'mine', 'stone', 'worm'] as const;
export type TutorialKey = (typeof TUTORIAL_KEYS)[number];

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const DailyStateSchema = z.object({
	/** Местная дата последнего клейма, YYYY-MM-DD. */
	lastClaimDate: DateStr.nullable(),
	streakDays: z.number().int().nonnegative(),
	longestStreak: z.number().int().nonnegative(),
	/** Максимальная виденная местная дата — защита от перевода часов назад. */
	maxSeenDate: DateStr.nullable(),
});
export type DailyState = z.infer<typeof DailyStateSchema>;

export const ProfileSchema = z.object({
	v: z.literal(1),
	coins: z.number().int().nonnegative(),
	selectedSkin: z.enum(SKIN_IDS),
	seenTutorials: z.array(z.enum(TUTORIAL_KEYS)),
	/** key → ISO-дата разблокировки. */
	achievements: z.record(z.string(), z.string()),
	daily: DailyStateSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

export function defaultProfile(): Profile {
	return {
		v: 1,
		coins: 0,
		selectedSkin: 'prospector',
		seenTutorials: [],
		achievements: {},
		daily: {lastClaimDate: null, streakDays: 0, longestStreak: 0, maxSeenDate: null},
	};
}

// ─── Дейлик (GDD §12.1) ─────────────────────────────────────────────

export function dailyRewardForStreak(streakDays: number): number {
	switch (streakDays) {
		case 1:
			return 20;
		case 2:
			return 30;
		case 3:
			return 40;
		case 4:
			return 50;
		case 5:
			return 60;
		case 6:
			return 80;
		default:
			return 100;
	}
}

export function dayDiff(a: string, b: string): number {
	const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
	const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
	return Math.round((ta - tb) / 86_400_000);
}

/** Эффективное «сегодня»: не раньше максимальной виденной даты. */
function effectiveToday(d: DailyState, today: string): string {
	return d.maxSeenDate && dayDiff(today, d.maxSeenDate) < 0 ? d.maxSeenDate : today;
}

export function dailyState(
	profile: Profile,
	today: string,
): {canClaim: boolean; streakDays: number; nextReward: number} {
	const d = profile.daily;
	const t = effectiveToday(d, today);
	if (!d.lastClaimDate) return {canClaim: true, streakDays: 0, nextReward: dailyRewardForStreak(1)};
	const diff = dayDiff(t, d.lastClaimDate);
	if (diff <= 0) {
		return {canClaim: false, streakDays: d.streakDays, nextReward: dailyRewardForStreak(d.streakDays + 1)};
	}
	const next = diff === 1 ? d.streakDays + 1 : 1;
	return {canClaim: true, streakDays: next - 1, nextReward: dailyRewardForStreak(next)};
}

export function claimDaily(
	profile: Profile,
	today: string,
): {profile: Profile; claimed: boolean; reward: number; streakDays: number} {
	const s = dailyState(profile, today);
	const t = effectiveToday(profile.daily, today);
	if (!s.canClaim) return {profile, claimed: false, reward: 0, streakDays: s.streakDays};

	const streakDays = s.streakDays + 1;
	const reward = dailyRewardForStreak(streakDays);
	return {
		profile: {
			...profile,
			coins: profile.coins + reward,
			daily: {
				lastClaimDate: t,
				streakDays,
				longestStreak: Math.max(profile.daily.longestStreak, streakDays),
				maxSeenDate: t,
			},
		},
		claimed: true,
		reward,
		streakDays,
	};
}

// ─── Ачивки (GDD §12.3) ─────────────────────────────────────────────

export type LevelRecordLike = {stars: number; timeMs: number; fuelSpent: number};

/**
 * Пересчёт ачивок после победы. `lastRun` — только что сыгранный заход
 * (для speedrunner / fuel_efficient), `levels` — все рекорды по уровням.
 * Выданное не отбирается. Возвращает новый профиль и список свежих ключей.
 */
export function evaluateAchievements(
	profile: Profile,
	levels: Record<number, LevelRecordLike>,
	lastRun: LevelRecordLike | null,
	nowIso: string,
): {profile: Profile; unlocked: AchievementKey[]} {
	const rows = Object.values(levels);
	const cleared = rows.length;
	const perfect = rows.filter((r) => r.stars >= 3).length;
	const totalStars = rows.reduce((s, r) => s + r.stars, 0);

	const conditions: Record<AchievementKey, boolean> = {
		first_clear: cleared >= 1,
		first_3stars: perfect >= 1,
		speedrunner: lastRun !== null && lastRun.timeMs < 10_000,
		fuel_efficient: lastRun !== null && lastRun.fuelSpent <= 300,
		all_levels: cleared >= LEVEL_COUNT,
		all_3stars: perfect >= LEVEL_COUNT,
		all_skins: totalStars >= ALL_SKINS_STARS,
	};

	const unlocked: AchievementKey[] = [];
	const next: Record<string, string> = {...profile.achievements};
	for (const key of ACHIEVEMENT_KEYS) {
		if (!next[key] && conditions[key]) {
			next[key] = nowIso;
			unlocked.push(key);
		}
	}
	return unlocked.length > 0 ? {profile: {...profile, achievements: next}, unlocked} : {profile, unlocked};
}

// ─── Слияние с серверной копией ──────────────────────────────────────

/**
 * Восстановление на новом устройстве или после переустановки: локальный
 * профиль сливается с серверным снимком. Монеты — максимум, флаги и ачивки
 * — объединение, дейлик — чей клейм позже, скин — локальный.
 */
export function mergeProfiles(local: Profile, remote: Profile | null): Profile {
	if (!remote) return local;
	const achievements: Record<string, string> = {...remote.achievements};
	for (const [k, v] of Object.entries(local.achievements)) {
		achievements[k] = achievements[k] && achievements[k]! < v ? achievements[k]! : v;
	}
	const seen = new Set<TutorialKey>([...remote.seenTutorials, ...local.seenTutorials]);
	const remoteLater =
		remote.daily.lastClaimDate !== null &&
		(local.daily.lastClaimDate === null || dayDiff(remote.daily.lastClaimDate, local.daily.lastClaimDate) > 0);
	return {
		v: 1,
		coins: Math.max(local.coins, remote.coins),
		selectedSkin: local.selectedSkin,
		seenTutorials: TUTORIAL_KEYS.filter((k) => seen.has(k)),
		achievements,
		daily: remoteLater ? remote.daily : local.daily,
	};
}
