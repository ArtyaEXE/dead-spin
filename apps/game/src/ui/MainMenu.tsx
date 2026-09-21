import {createSignal, Show} from 'solid-js';
import {getActiveSkinId, getSkinById} from '../stores/skin';
import {progressStore} from '../stores/progress';
import {profileStore, useProfile} from '../stores/profile';
import {localDate} from '../lib/persist';
import {AchievementsOverlay} from './Achievements';


/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки → Settings; иконка-корабль → Shop (выбор скина).
 *
 * Daily-плашка (если бонус доступен сегодня) — над Play. Дейлик считается
 * на устройстве по местной дате (GDD §14), сервер получает снимок профиля.
 */
export function MainMenu(props: {onPlay: () => void; onSettings: () => void; onShop: () => void}) {
	const profile = useProfile();
	const shipSrc = (): string =>
		getSkinById(getActiveSkinId(progressStore.getState().summaryStars)).src;

	const daily = () => profileStore.getState().dailyState(localDate());
	const [claimed, setClaimed] = createSignal<number | null>(null);
	const [showAchievements, setShowAchievements] = createSignal(false);

	const claim = (): void => {
		const r = profileStore.getState().claimDaily(localDate());
		if (!r.claimed) return;
		setClaimed(r.reward);
		setTimeout(() => setClaimed(null), 3000);
	};

	return (
		<div class="mm-root">
			<div class="mm-top">
				<img class="mm-shop pressable" src={shipSrc()} alt="Shop" onClick={props.onShop} />
				<div class="panel">
					<img class="icon-inline" src="/icons/coins-icon.png" alt="" />
					{profile().profile.coins}
				</div>
				<img class="mm-cog pressable" src="/btn-cog.png" alt="Settings" onClick={props.onSettings} />
			</div>

			<img class="mm-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />

			<Show when={profile() && daily().canClaim}>
				<div class="daily-banner pressable" onClick={claim}>
					<img class="icon-inline" src="/icons/daily-gift-icon.png" alt="" />
					Забрать бонус: +{daily().nextReward} монет
					<span class="daily-streak">день {daily().streakDays + 1}</span>
				</div>
			</Show>

			<Show when={claimed()}>
				{(r) => (
					<div class="daily-toast">
						✅ +{r()} монет
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
