import {createStore} from 'zustand/vanilla';
import {
	ProfileSchema,
	defaultProfile,
	dailyState,
	claimDaily,
	evaluateAchievements,
	mergeProfiles,
	type Profile,
	type SkinId,
	type TutorialKey,
	type LevelRecordLike,
	type AchievementKey,
} from '@dead-spin/shared';
import {createSolidStoreAdapter} from './solid';
import {syncStore} from './sync';
import {loadJson, saveJson} from '../lib/persist';
import {track} from '../analytics';

/**
 * Профиль игрока на устройстве — монеты, скин, туториалы, дейлик, ачивки.
 * Источник истины (GDD §16.2). Каждое изменение сохраняется локально и
 * кладётся снимком в очередь синхронизации; сервер хранит копию.
 */

const KEY = 'dead-spin.profile.v1';

type ProfileState = {
	profile: Profile;
	setSkin: (id: SkinId) => void;
	markTutorialSeen: (key: TutorialKey) => void;
	spendCoins: (amount: number, reason: string) => boolean;
	addCoins: (amount: number, reason: string) => void;
	dailyState: (today: string) => ReturnType<typeof dailyState>;
	claimDaily: (today: string) => {claimed: boolean; reward: number; streakDays: number};
	/** После победы: пересчитать ачивки. Возвращает свежие ключи. */
	evaluateAfterLevel: (levels: Record<number, LevelRecordLike>, lastRun: LevelRecordLike) => AchievementKey[];
	/** Слить серверную копию (восстановление на новом устройстве). */
	mergeRemote: (remote: Profile | null) => void;
};

export const profileStore = createStore<ProfileState>((set, get) => {
	const commit = (profile: Profile): void => {
		set({profile});
		saveJson(KEY, profile);
		syncStore.getState().enqueueProfile(profile);
	};

	return {
		profile: loadJson(KEY, ProfileSchema, defaultProfile),

		setSkin(id) {
			if (get().profile.selectedSkin === id) return;
			commit({...get().profile, selectedSkin: id});
		},

		markTutorialSeen(key) {
			const p = get().profile;
			if (p.seenTutorials.includes(key)) return;
			commit({...p, seenTutorials: [...p.seenTutorials, key]});
		},

		spendCoins(amount, reason) {
			const p = get().profile;
			if (amount <= 0 || p.coins < amount) return false;
			commit({...p, coins: p.coins - amount});
			track('coins_spent', {amount, reason});
			return true;
		},

		addCoins(amount, reason) {
			if (amount <= 0) return;
			commit({...get().profile, coins: get().profile.coins + amount});
			track('coins_earned', {amount, reason});
		},

		dailyState(today) {
			return dailyState(get().profile, today);
		},

		claimDaily(today) {
			const r = claimDaily(get().profile, today);
			if (r.claimed) {
				commit(r.profile);
				track('daily_claim', {streak: r.streakDays, coins: r.reward});
			}
			return {claimed: r.claimed, reward: r.reward, streakDays: r.streakDays};
		},

		evaluateAfterLevel(levels, lastRun) {
			const r = evaluateAchievements(get().profile, levels, lastRun, new Date().toISOString());
			if (r.unlocked.length > 0) {
				commit(r.profile);
				for (const key of r.unlocked) track('achievement_unlocked', {key});
			}
			return r.unlocked;
		},

		mergeRemote(remote) {
			if (!remote) return;
			const merged = mergeProfiles(get().profile, remote);
			if (JSON.stringify(merged) === JSON.stringify(get().profile)) return;
			set({profile: merged});
			saveJson(KEY, merged);
		},
	};
});

export const useProfile = createSolidStoreAdapter(profileStore);
