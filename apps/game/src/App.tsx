import {createEffect, createSignal, Match, Show, Switch, onMount} from 'solid-js';
import {authStore, useAuth} from './stores/auth';
import {useProgress} from './stores/progress';
import {LoginScreen} from './ui/LoginScreen';
import {MainMenu} from './ui/MainMenu';
import {Levels} from './ui/Levels';
import {Settings} from './ui/Settings';
import {GameScreen} from './ui/GameScreen';
import {MusicPlayer} from './ui/MusicPlayer';
import {Intro} from './ui/Intro';
import {FpsCounter} from './ui/FpsCounter';
import {audio} from './game/audio';
import {preloadAll} from './game/preload';


type Route =
	| {name: 'main'}
	| {name: 'settings'}
	| {name: 'levels'}
	| {name: 'intro'; level: number}
	| {name: 'game'; level: number};


export default function App() {
	const auth = useAuth();
	const progress = useProgress();
	const [route, setRoute] = createSignal<Route>({name: 'main'});
	// Как в оригинальном runMusicPlayer — музыка стартует после первого
	// нажатия "Играть" в главном меню.
	const [musicPlay, setMusicPlay] = createSignal(false);
	const [preloadDone, setPreloadDone] = createSignal(false);
	const [preloadPct, setPreloadPct] = createSignal(0);

	onMount(() => {
		void authStore.getState().refresh();
		type Inset = {top?: number; bottom?: number; left?: number; right?: number};
		type TgWebApp = {
			expand?: () => void;
			ready?: () => void;
			requestFullscreen?: () => void;
			disableVerticalSwipes?: () => void;
			isVersionAtLeast?: (v: string) => boolean;
			onEvent?: (event: string, handler: () => void) => void;
			safeAreaInset?: Inset;
			contentSafeAreaInset?: Inset;
		};
		const tg = (window as unknown as {Telegram?: {WebApp?: TgWebApp}}).Telegram?.WebApp;
		tg?.ready?.();
		tg?.expand?.();
		try {
			if (tg?.isVersionAtLeast?.('8.0')) tg.requestFullscreen?.();
		} catch {/* старая версия — остаётся expand() как фоллбэк */}
		try {
			if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.();
		} catch {/* noop */}

		// Telegram-специфичные safe-area: SDK 8.0+ предоставляет два инсета —
		//   safeAreaInset       — device notches/dynamic island
		//   contentSafeAreaInset — собственный UI Telegram (close-button, ⋮-меню)
		// Складываем их и переписываем CSS-переменные --sa-*. На обычном
		// браузере эти поля undefined → используется env() как фоллбэк.
		if (tg) {
			const applyTgInsets = (): void => {
				const sa = tg.safeAreaInset || {};
				const ca = tg.contentSafeAreaInset || {};
				const root = document.documentElement.style;
				const set = (side: 'top' | 'bottom' | 'left' | 'right'): void => {
					const a = sa[side] ?? 0, b = ca[side] ?? 0;
					if (a > 0 || b > 0) root.setProperty(`--sa-${side}`, `${a + b}px`);
					else root.removeProperty(`--sa-${side}`);
				};
				set('top'); set('bottom'); set('left'); set('right');
			};
			applyTgInsets();
			try { tg.onEvent?.('safeAreaChanged', applyTgInsets); } catch {/* noop */}
			try { tg.onEvent?.('contentSafeAreaChanged', applyTgInsets); } catch {/* noop */}
			try { tg.onEvent?.('viewportChanged', applyTgInsets); } catch {/* noop */}
			try { tg.onEvent?.('fullscreenChanged', applyTgInsets); } catch {/* noop */}
		}
	});

	// Прелоадим весь контент сразу после успешной авторизации —
	// до показа MainMenu, чтобы все последующие переходы были мгновенными.
	createEffect(() => {
		if (auth().status !== 'authed') return;
		audio.init();
		void preloadAll((done, total) => {
			setPreloadPct(Math.floor((done / total) * 100));
		}).then(() => setPreloadDone(true));
	});

	const startLevel = (level: number): void => {
		const alreadyCleared = Boolean(progress().levels[level]);
		if (level === 1 && !alreadyCleared) setRoute({name: 'intro', level});
		else setRoute({name: 'game', level});
	};

	return (
		<div class="app">
			<div class="screen">
				<Switch>
					<Match when={auth().status !== 'authed'}>
						<LoginScreen />
					</Match>

					<Match when={!preloadDone()}>
						<div class="preload-root">
							<img class="preload-logo" src="/dead-spin-logo-shadow.png" alt="Dead Spin" />
							<img class="preload-gear" src="/icons/icon-loading.png" alt="" />
							<div class="preload-bar"><div class="preload-bar-fill" style={{width: `${preloadPct()}%`}} /></div>
							<div class="preload-pct">{preloadPct()}%</div>
						</div>
					</Match>

					<Match when={route().name === 'main'}>
						<MainMenu
							onPlay={() => { setMusicPlay(true); setRoute({name: 'levels'}); }}
							onSettings={() => setRoute({name: 'settings'})}
						/>
					</Match>

					<Match when={route().name === 'settings'}>
						<Settings onBack={() => setRoute({name: 'main'})} />
					</Match>

					<Match when={route().name === 'levels'}>
						<Levels
							onBack={() => setRoute({name: 'main'})}
							onPlay={startLevel}
						/>
					</Match>

					<Match when={route().name === 'intro'}>
						{(() => {
							const r = route();
							if (r.name !== 'intro') return null;
							return <Intro onFinish={() => setRoute({name: 'game', level: r.level})} />;
						})()}
					</Match>

					<Match when={route().name === 'game'}>
						{(() => {
							const r = route();
							if (r.name !== 'game') return null;
							return (
								<GameScreen
									levelNumber={r.level}
									onExit={() => setRoute({name: 'levels'})}
									onSwitchLevel={(n) => setRoute({name: 'game', level: n})}
								/>
							);
						})()}
					</Match>
				</Switch>

				<Show when={auth().status === 'authed'}>
					<MusicPlayer play={musicPlay()} />
				</Show>

				<FpsCounter />
			</div>
		</div>
	);
}
