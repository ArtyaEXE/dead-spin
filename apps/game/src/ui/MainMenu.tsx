import {createSignal, createEffect, onCleanup, onMount, Show} from 'solid-js';
import {getActiveSkinId, getSkinById} from '../stores/skin';
import {progressStore} from '../stores/progress';
import {authStore} from '../stores/auth';
import {api, ApiError} from '../net/client';
import type {DailyStateResponse} from '../net/schemas';
import {track} from '../analytics';
import {AchievementsOverlay} from './Achievements';


/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки → Settings; иконка-корабль → Shop (выбор скина).
 *
 * Daily-плашка (если бонус доступен сегодня) — над Play. Тап забирает,
 * показывает анимированный баннер и обновляет fuel/coins в auth-сторе.
 */
export function MainMenu(props: {onPlay: () => void; onSettings: () => void; onShop: () => void}) {
	const shipSrc = (): string =>
		getSkinById(getActiveSkinId(progressStore.getState().summaryStars)).src;

	const [daily, setDaily] = createSignal<DailyStateResponse | null>(null);
	const [claimed, setClaimed] = createSignal<{coins: number} | null>(null);
	const [showAchievements, setShowAchievements] = createSignal(false);

	onMount(() => {
		void api.dailyState()
			.then(setDaily)
			.catch((e) => {
				if (e instanceof ApiError && (e.status === 401 || e.status === 0)) return;
				console.warn('dailyState failed:', e);
			});
	});

	const claim = async (): Promise<void> => {
		const state = daily();
		if (!state || !state.canClaim) return;
		try {
			const res = await api.claimDaily();
			authStore.getState().setUser(res.user);
			if (res.claimed && res.reward) {
				setClaimed(res.reward);
				setTimeout(() => setClaimed(null), 3000);
				track('daily_claim', {streak: res.streakDays, coins: res.reward.coins});
			}
			setDaily({
				canClaim: false,
				streakDays: res.streakDays,
				nextReward: res.nextReward,
			});
		} catch (e) {
			console.warn('claimDaily failed:', e);
		}
	};

	const fmtReward = (r: {coins: number}): string => `+${r.coins} монет`;

	return (
		<div class="mm-root">
			<div class="mm-top">
				<img class="mm-shop pressable" src={shipSrc()} alt="Shop" onClick={props.onShop} />
				<img class="mm-cog pressable" src="/btn-cog.png" alt="Settings" onClick={props.onSettings} />
			</div>

			<img class="mm-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />

			<Show when={daily()?.canClaim}>
				{(_) => (
					<div class="daily-banner pressable" onClick={() => void claim()}>
						<img class="icon-inline" src="/icons/daily-gift-icon.png" alt="" />
						Забрать бонус: {fmtReward(daily()!.nextReward)}
						<span class="daily-streak">день {(daily()!.streakDays) + 1}</span>
					</div>
				)}
			</Show>

			<Show when={claimed()}>
				{(r) => (
					<div class="daily-toast">
						✅ {fmtReward(r())}
					</div>
				)}
			</Show>

			<div class="mm-play pressable" onClick={props.onPlay}>
				<img src="/btn-play.png" alt="Play" />
			</div>

			<div class="mm-footer">
				<button class="mm-trophy pressable" onClick={() => setShowAchievements(true)}>
					<img src="/icons/trophy-icon.png" alt="achievements" />
				</button>
			</div>

			<Show when={showAchievements()}>
				<AchievementsOverlay onClose={() => setShowAchievements(false)} />
			</Show>
		</div>
	);
}
