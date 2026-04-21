import {createSignal, Match, Show, Switch, onMount} from 'solid-js';
import {authStore, useAuth} from './stores/auth';
import {useProgress} from './stores/progress';
import {LoginScreen} from './ui/LoginScreen';
import {MainMenu} from './ui/MainMenu';
import {Levels} from './ui/Levels';
import {Settings} from './ui/Settings';
import {GameScreen} from './ui/GameScreen';
import {MusicPlayer} from './ui/MusicPlayer';
import {Intro} from './ui/Intro';


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

	onMount(() => {
		void authStore.getState().refresh();
		const tg = (window as unknown as {Telegram?: {WebApp?: {expand?: () => void; ready?: () => void}}}).Telegram?.WebApp;
		tg?.expand?.();
		tg?.ready?.();
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
			</div>
		</div>
	);
}
