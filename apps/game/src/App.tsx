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
		const tg = (window as unknown as {Telegram?: {WebApp?: {
			expand?: () => void;
			ready?: () => void;
			requestFullscreen?: () => void;
			disableVerticalSwipes?: () => void;
			isVersionAtLeast?: (v: string) => boolean;
		}}}).Telegram?.WebApp;
		tg?.ready?.();
		tg?.expand?.();
		// Bot API 8.0+ методы. На старых клиентах (Telegram 6.x, Web K) сами методы
		// ОПРЕДЕЛЕНЫ, но при вызове SDK бросает WebAppMethodUnsupported и ломает
		// onMount. Проверяем версию и/или глотаем ошибку.
		try {
			if (tg?.isVersionAtLeast?.('8.0')) tg.requestFullscreen?.();
		} catch {/* старая версия — остаётся expand() как фоллбэк */}
		try {
			if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.();
		} catch {/* noop */}
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
