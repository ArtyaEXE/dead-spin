import {createSignal, Show} from 'solid-js';
import {getActiveSkinId, getSkinById} from '../stores/skin';
import {progressStore} from '../stores/progress';
import {profileStore, useProfile} from '../stores/profile';
import {localDate} from '../lib/persist';
import {t} from '../i18n';
import {AchievementsOverlay} from './Achievements';
import {Icon, RoundBtn} from './Icon';
import {Logo} from './Logo';

/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки → Settings; иконка-корабль → Shop (выбор скина).
 *
 * Daily-плашка (если бонус доступен сегодня) — над Play. Дейлик считается
 * на устройстве по местной дате (GDD §14), сервер получает снимок профиля.
 */
export function MainMenu(props: {onPlay: () => void; onSettings: () => void; onShop: () => void}) {
	const profile = useProfile();
	const shipSrc = (): string => getSkinById(getActiveSkinId(progressStore.getState().summaryStars)).src;

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
				<img class="mm-shop pressable" src={shipSrc()} alt={t('a11y.shop')} onClick={props.onShop} />
				<div class="panel">
					<img class="icon-inline" src="/icons/coins-icon.svg" alt="" />
					{profile().profile.coins}
				</div>
				<RoundBtn icon="cog" label={t('a11y.settings')} size="md" onClick={props.onSettings} />
			</div>

			<Logo class="mm-logo" />

			<Show when={profile() && daily().canClaim}>
				<div class="daily-banner pressable" onClick={claim}>
					<img class="icon-inline" src="/icons/daily-gift-icon.svg" alt="" />
					{t('daily.claim', {n: daily().nextReward})}
					<span class="daily-streak">{t('daily.day', {n: daily().streakDays + 1})}</span>
				</div>
			</Show>

			<Show when={claimed()}>
				{(r) => (
					<div class="daily-toast">
						<Icon name="check" /> {t('daily.claimed', {n: r()})}
					</div>
				)}
			</Show>

			<div class="mm-play">
				<RoundBtn icon="play" label={t('a11y.play')} size="xl" tone="goal" onClick={props.onPlay} />
			</div>

			<div class="mm-footer">
				<button
					type="button"
					class="mm-trophy pressable"
					aria-label={t('a11y.achievements')}
					onClick={() => setShowAchievements(true)}
				>
					<img src="/icons/trophy-icon.svg" alt="" />
				</button>
			</div>

			<Show when={showAchievements()}>
				<AchievementsOverlay onClose={() => setShowAchievements(false)} />
			</Show>
		</div>
	);
}
