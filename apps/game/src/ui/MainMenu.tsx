import {createSignal, createEffect, onCleanup, onMount, Show} from 'solid-js';
import {getActiveSkinId, getSkinById} from '../stores/skin';
import {useLiveFuel} from '../stores/fuel';
import {progressStore} from '../stores/progress';
import {authStore} from '../stores/auth';
import {challengeStore, formatTimeLeft, useChallenge} from '../stores/challenge';
import {challengePushStore, useChallengePush} from '../stores/challenge-push';
import {modeStore} from '../stores/mode';
import {groupStore} from '../stores/group';
import {api, ApiError} from '../net/client';
import type {DailyStateResponse, PendingPush} from '../net/schemas';
import {track} from '../analytics';
import {AchievementsOverlay} from './Achievements';
import {ChallengePushOverlay} from './ChallengePushOverlay';


/**
 * MainMenu — стартовый экран: логотип и крутящаяся кнопка Play.
 * Иконка шестерёнки → Settings; иконка-корабль → Shop (выбор скина).
 *
 * Daily-плашка (если бонус доступен сегодня) — над Play. Тап забирает,
 * показывает анимированный баннер и обновляет fuel/coins в auth-сторе.
 */
export function MainMenu(props: {
	onPlay: () => void; onSettings: () => void; onShop: () => void;
	showEditor?: boolean; onEditor?: () => void;
}) {
	const shipSrc = (): string =>
		getSkinById(getActiveSkinId(progressStore.getState().summaryStars)).src;
	const liveFuel = useLiveFuel();
	const fuelK = () => (liveFuel() / 1000).toFixed(2);

	const [daily, setDaily] = createSignal<DailyStateResponse | null>(null);
	const [claimed, setClaimed] = createSignal<{fuel: number; coins: number} | null>(null);
	const [showAchievements, setShowAchievements] = createSignal(false);
	const challengeState = useChallenge();
	const challenge = () => challengeState().current;
	const [tick, setTick] = createSignal(0);

	const pushState = useChallengePush();

	onMount(() => {
		void api.dailyState()
			.then(setDaily)
			.catch((e) => {
				if (e instanceof ApiError && (e.status === 401 || e.status === 0)) return;
				console.warn('dailyState failed:', e);
			});
		void challengeStore.getState().refresh();
		challengePushStore.getState().startPolling();
	});

	onCleanup(() => {
		challengePushStore.getState().stopPolling();
	});

	const handlePushGo = (push: PendingPush): void => {
		challengePushStore.getState().clearPending();
		challengePushStore.getState().stopPolling();
		// Переключаемся в group mode с контекстом этого чата, чтобы
		// level-complete записался в group_progress_levels.
		groupStore.setState({chatId: push.chatId, hmac: push.hmac, title: push.chatTitle});
		modeStore.getState().setMode('group');
		props.onPlay();
	};

	// Тикалка для лайв-таймера челленджа (раз в секунду пере-рендерим
	// строку «осталось 47:23»). Без интервала — просто статичная цифра
	// и юзер видит «50:00» весь час.
	createEffect(() => {
		if (!challenge()) return;
		const id = window.setInterval(() => setTick(t => t + 1), 1000);
		onCleanup(() => window.clearInterval(id));
	});

	// Подсказка времени до экспайра, реактивно к tick().
	const timeLeft = (): string | null => {
		tick(); // dependency
		const c = challenge();
		if (!c) return null;
		return formatTimeLeft(c.expiresAt);
	};

	// В DM (нет groupChatId) индикатор приглушённый — челлендж в другом
	// чате, юзер должен туда пойти. В нужной беседе индикатор «активный».
	const challengeInThisChat = (): boolean => {
		const c = challenge();
		if (!c) return false;
		const g = groupStore.getState();
		return g.chatId === c.chatId;
	};

	const claim = async (): Promise<void> => {
		const state = daily();
		if (!state || !state.canClaim) return;
		try {
			const res = await api.claimDaily();
			authStore.getState().setUser(res.user);
			if (res.claimed && res.reward) {
				setClaimed(res.reward);
				setTimeout(() => setClaimed(null), 3000);
				track('daily_claim', {streak: res.streakDays, fuel: res.reward.fuel, coins: res.reward.coins});
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

	const fmtReward = (r: {fuel: number; coins: number}): string => {
		if (r.coins > 0) return `+${r.coins} 💰`;
		if (r.fuel > 0) return `+${(r.fuel / 1000).toFixed(0)}k ⛽`;
		return '';
	};

	return (
		<div class="mm-root">
			<div class="mm-top">
				<img class="mm-shop pressable" src={shipSrc()} alt="Shop" onClick={props.onShop} />
				<div class="panel">
					<img class="icon-inline" src="/icons/fuel-icon.png" alt="" />
					{fuelK()}
				</div>
				<img class="mm-cog pressable" src="/btn-cog.png" alt="Settings" onClick={props.onSettings} />
			</div>

			<img class="mm-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />

			<Show when={challenge() && challengeInThisChat()}>
				{(_) => {
					const c = () => challenge()!;
					return (
						<div
							class="challenge-banner pressable"
							classList={{
								'challenge-banner--pending': c().status === 'pending_accept',
								'challenge-banner--active': c().status === 'active',
							}}
						>
							<div class="challenge-banner__bg" />
							<div class="challenge-banner__content">
								<div class="challenge-banner__title">
									<img class="icon-inline" src={c().status === 'pending_accept' ? '/icons/clock-icon.png' : '/icons/challenge-icon.png'} alt="" />
									{c().status === 'pending_accept' ? 'Ждём ответа' : 'Активный челлендж'}
								</div>
								<div class="challenge-banner__row">
									<span class="challenge-banner__opponent">vs <b>{c().opponentUsername}</b></span>
									<span class="challenge-banner__level">уровень {c().level}</span>
								</div>
								<Show when={timeLeft()}>
									{(tl) => <div class="challenge-banner__timer">{tl()} осталось</div>}
								</Show>
							</div>
						</div>
					);
				}}
			</Show>

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
				<Show when={props.showEditor}>
					<button class="mm-editor pressable" onClick={() => props.onEditor?.()}>EDITOR</button>
				</Show>
			</div>

			<Show when={showAchievements()}>
				<AchievementsOverlay onClose={() => setShowAchievements(false)} />
			</Show>

			<Show when={pushState().pending}>
				{(push) => (
					<ChallengePushOverlay
						push={push()}
						onGo={handlePushGo}
						onDismiss={() => challengePushStore.getState().clearPending()}
					/>
				)}
			</Show>
		</div>
	);
}
