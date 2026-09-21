import {createEffect, createSignal, Match, Show, Switch, onMount} from 'solid-js';
import {authStore, useAuth} from './stores/auth';
import {progressStore, useProgress} from './stores/progress';
import {profileStore} from './stores/profile';
import {syncStore} from './stores/sync';
import {MainMenu} from './ui/MainMenu';
import {Levels} from './ui/Levels';
import {Settings} from './ui/Settings';
import {GameScreen} from './ui/GameScreen';
import {MusicPlayer} from './ui/MusicPlayer';
import {ComicPlayer} from './ui/ComicPlayer';
import {getComic} from './ui/comics';
import {Shop} from './ui/Shop';
import {audio} from './game/audio';
import {preloadAll} from './game/preload';
import {getLevelByNumber} from '@dead-spin/levels';


type Route =
	| {name: 'main'}
	| {name: 'settings'}
	| {name: 'shop'}
	| {name: 'levels'}
	| {name: 'intro'; level: number; comicId: string}
	| {name: 'outro'; nextLevel: number; comicId: string}
	| {name: 'game'; level: number};


const OUTRO_SEEN_KEY = (id: string): string => `comic-outro-seen-${id}`;
function isOutroSeen(id: string): boolean {
	try { return localStorage.getItem(OUTRO_SEEN_KEY(id)) === '1'; } catch { return false; }
}
function markOutroSeen(id: string): void {
	try { localStorage.setItem(OUTRO_SEEN_KEY(id), '1'); } catch {/* noop */}
}


export default function App() {
	const auth = useAuth();
	const progress = useProgress();
	const [route, setRoute] = createSignal<Route>({name: 'main'});
	// Как в оригинальном runMusicPlayer — музыка стартует после первого
	// нажатия "Играть" в главном меню.
	const [musicPlay, setMusicPlay] = createSignal(false);
	const [preloadDone, setPreloadDone] = createSignal(false);
	const [preloadPct, setPreloadPct] = createSignal(0);

	// Офлайн-first (GDD §16.2): прогресс и профиль уже загружены из хранилища
	// при создании сторов, поэтому игра стартует сразу. Учётка заводится в
	// фоне; сервер нужен только для копии, чужих призраков и лидерборда.
	onMount(() => {
		audio.init();
		syncStore.getState().init();
		void authStore.getState().boot();
		void preloadAll((done, total) => {
			setPreloadPct(Math.floor((done / total) * 100));
		}).then(() => setPreloadDone(true));
	});

	// Когда учётка появилась — сливаем серверные копии с локальными и
	// проталкиваем очередь отложенных записей.
	createEffect(() => {
		if (auth().status !== 'authed') return;
		profileStore.getState().mergeRemote(auth().user?.profile ?? null);
		void progressStore.getState().refresh().catch(() => {});
		void syncStore.getState().flush();
	});

	const startLevel = (level: number): void => {
		const alreadyCleared = Boolean(progress().levels[level]);
		const intro = getLevelByNumber(level)?.intro;
		if (intro && !alreadyCleared && getComic(intro)) {
			setRoute({name: 'intro', level, comicId: intro});
		} else {
			setRoute({name: 'game', level});
		}
	};

	// onNext из ResultScreen → может прервать переход на следующий уровень
	// outro-катсценой только что завершённого. Гейт через localStorage —
	// outro показывается ровно один раз за всё время на устройстве.
	const switchLevel = (nextLevel: number): void => {
		const justFinished = nextLevel - 1;
		const outro = getLevelByNumber(justFinished)?.outro;
		if (outro && getComic(outro) && !isOutroSeen(outro)) {
			markOutroSeen(outro);
			setRoute({name: 'outro', nextLevel, comicId: outro});
		} else {
			setRoute({name: 'game', level: nextLevel});
		}
	};

	return (
		<div class="app">
			<div class="screen">
				<Switch>
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
							onShop={() => setRoute({name: 'shop'})}
						/>
					</Match>

					<Match when={route().name === 'settings'}>
						<Settings onBack={() => setRoute({name: 'main'})} />
					</Match>

					<Match when={route().name === 'shop'}>
						<Shop onBack={() => setRoute({name: 'main'})} />
					</Match>

					<Match when={route().name === 'levels'}>
						<Levels
							onBack={() => setRoute({name: 'main'})}
							onPlay={startLevel}
						/>
					</Match>

					<Match when={route().name === 'intro'}>
						<Show
							when={route().name === 'intro' ? (route() as {name: 'intro'; level: number; comicId: string}) : null}
							keyed
						>
							{(r) => {
								const comic = getComic(r.comicId);
								if (!comic) {
									setRoute({name: 'game', level: r.level});
									return null;
								}
								return (
									<ComicPlayer
										comic={comic}
										onFinish={() => setRoute({name: 'game', level: r.level})}
									/>
								);
							}}
						</Show>
					</Match>

					<Match when={route().name === 'outro'}>
						<Show
							when={route().name === 'outro' ? (route() as {name: 'outro'; nextLevel: number; comicId: string}) : null}
							keyed
						>
							{(r) => {
								const comic = getComic(r.comicId);
								if (!comic) {
									setRoute({name: 'game', level: r.nextLevel});
									return null;
								}
								return (
									<ComicPlayer
										comic={comic}
										onFinish={() => setRoute({name: 'game', level: r.nextLevel})}
									/>
								);
							}}
						</Show>
					</Match>

					<Match when={route().name === 'game'}>
						{/*
							Show keyed по уровню — GameScreen пересоздаётся ТОЛЬКО когда
							реально меняется номер уровня (через next-button). Прежний
							IIFE-паттерн вызывал re-mount на любое изменение route(),
							из-за чего уровень случайно "перезапускался".
						*/}
						<Show when={route().name === 'game' ? (route() as {name: 'game'; level: number}).level : null} keyed>
							{(level) => (
								<GameScreen
									levelNumber={level}
									onExit={() => setRoute({name: 'levels'})}
									onSwitchLevel={switchLevel}
								/>
							)}
						</Show>
					</Match>
				</Switch>

				<Show when={preloadDone()}>
					<MusicPlayer play={musicPlay()} />
				</Show>
			</div>
		</div>
	);
}
