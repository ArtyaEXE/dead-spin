import {createEffect, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {getLevelByNumber, getNextLevelNumber} from '@dead-spin/levels';
import {api} from '../net/client';
import {authStore} from '../stores/auth';
import {progressStore} from '../stores/progress';
import {ghostStore, useGhost} from '../stores/ghost';
import {groupStore, useGroup} from '../stores/group';
import {useChallenge, formatTimeLeft} from '../stores/challenge';
import {challengePushStore} from '../stores/challenge-push';
import {isGroupMode} from '../stores/mode';
import {track} from '../analytics';
import {GameWorld, type GameResult} from '../game/GameWorld';
import {audio, type LoopHandle} from '../game/audio';
import {TopBar} from './TopBar';
import {BottomBar} from './BottomBar';
import {ResultScreen, type ResultKind} from './ResultScreen';
import {TutorialOverlay, computeTutorialQueue, markSeen} from './Tutorial';


const LOW_FUEL_THRESHOLD = 2000;


function fmtTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}


const ZOOM_STEP = 0.2;
// Задержка показа overlay ResultScreen — соответствует оригинальному
// `delay: result === 'pause' ? 0 : 500` в ResultScreen.svelte.
// Shake и взрыв при этом работают сразу, overlay появляется после.
const RESULT_OVERLAY_DELAY_MS = 500;


export function GameScreen(props: {
	levelNumber: number;
	onExit: () => void;
	onSwitchLevel: (n: number) => void;
}) {
	let hostRef: HTMLDivElement | undefined;
	let world: GameWorld | null = null;

	const [fuel, setFuel] = createSignal(0);
	const [stars, setStars] = createSignal(0);
	const [time, setTime] = createSignal(0);
	// result — "игра окончена" состояние (физика заморожена).
	const [result, setResult] = createSignal<GameResult | null>(null);
	// showOverlay — виден ли экран с итогами. Для loose/win задерживаем показ.
	const [showOverlay, setShowOverlay] = createSignal(false);
	const [pause, setPause] = createSignal(false);
	const [shake, setShake] = createSignal(false);
	// Low-fuel alarm: красная пульсация вокруг экрана + sirens, когда топлива мало
	// и нет финального оверлея/паузы.
	const isLowFuel = (): boolean =>
		fuel() < LOW_FUEL_THRESHOLD &&
		!result() &&
		!pause() &&
		fuel() > 0;
	let alarmHandle: LoopHandle | null = null;
	createEffect(() => {
		if (isLowFuel()) {
			if (!alarmHandle) {
				alarmHandle = audio.loop('low-fuel');
				alarmHandle?.setVolume(0.4);
			}
		} else {
			alarmHandle?.stop();
			alarmHandle = null;
		}
	});
	// Очередь туториалов: управление на L1 + первое знакомство с mine/stone/worm.
	// Мир монтируется только после того, как очередь опустеет, чтобы spawn-анимация
	// игралась уже "на глазах" у игрока.
	const [tutorialQueue, setTutorialQueue] = createSignal<ReturnType<typeof computeTutorialQueue>>([]);

	let overlayTimer: number | null = null;

	const initWorld = (levelNumber: number) => {
		const level = getLevelByNumber(levelNumber);
		if (!level || !hostRef) return;

		const user = authStore.getState().user;
		world = new GameWorld(level, levelNumber, {
			onFuelChange: setFuel,
			onStarsChange: setStars,
			onTimeChange: setTime,
			onResult: async (r) => {
				setResult(r);

				// Shake запускается сразу — параллельно со взрывом (оригинал
				// shakeTimeout = 501мс сразу после explosionPos).
				if (r.type === 'loose') {
					setShake(true);
					setTimeout(() => setShake(false), 500);
				}

				// Challenge push: после level-complete/death проверяем, не ждёт
				// ли нас принятый челлендж. Если да — MainMenu покажет overlay.
				void challengePushStore.getState().checkOnce();

				// Показ overlay откладываем, чтобы была видна анимация взрыва.
				if (overlayTimer !== null) clearTimeout(overlayTimer);
				overlayTimer = window.setTimeout(
					() => setShowOverlay(true),
					RESULT_OVERLAY_DELAY_MS,
				);

				if (r.type === 'win') {
					progressStore.getState().recordLocal(levelNumber, r.stars, r.timeMs, r.fuelSpent);
					track('level_win', {
						level: levelNumber,
						stars: r.stars,
						time_ms: r.timeMs,
						fuel_spent: r.fuelSpent,
						in_group: isGroupMode(),
					});
					try {
						const recording = world?.getRecording() ?? null;
						await api.levelComplete({
							level: levelNumber,
							stars: r.stars,
							timeMs: r.timeMs,
							fuelSpent: r.fuelSpent,
							recording: recording ?? undefined,
						});
					} catch {}
				} else if (r.type === 'loose') {
					track('level_loose', {
						level: levelNumber,
						time_ms: r.timeMs,
						fuel_spent: r.fuelSpent,
						in_group: isGroupMode(),
					});
				}

				if (r.fuelSpent > 0) {
					try {
						const res = await api.fuelSpend(r.fuelSpent);
						const u = authStore.getState().user;
						if (u) authStore.getState().setUser({...u, fuel: res.fuel});
					} catch {}
				}
			},
		});
		void world.mount(hostRef, user?.fuel ?? 10_000).then(() => {
			// После того как сцена готова — применяем ghost (если он уже
			// загружен ghostStore'ом). На случай гонки: setGhostRecording
			// будет вызвана повторно из createEffect ниже когда стор обновится.
			const cur = ghostStore.getState().current;
			world?.setGhostRecording(cur ? cur.recording : null);
		});
		track('level_start', {
			level: levelNumber,
			in_group: isGroupMode(),
		});
	};

	// Грузим ghost для текущего уровня (только в групповом контексте — в DM
	// store просто отдаст null без сети). После успеха setGhostRecording
	// автоматически применит запись.
	void ghostStore.getState().load(props.levelNumber);

	const ghost = useGhost();
	createEffect(() => {
		const cur = ghost().current;
		world?.setGhostRecording(cur ? cur.recording : null);
	});

	onMount(() => {
		const queue = computeTutorialQueue(props.levelNumber);
		setTutorialQueue(queue);
		if (queue.length === 0) initWorld(props.levelNumber);
	});

	const dismissTutorial = () => {
		const q = tutorialQueue();
		if (q.length === 0) return;
		markSeen(q[0]!);
		const rest = q.slice(1);
		setTutorialQueue(rest);
		if (rest.length === 0) initWorld(props.levelNumber);
	};

	onCleanup(() => {
		if (overlayTimer !== null) clearTimeout(overlayTimer);
		alarmHandle?.stop();
		alarmHandle = null;
		world?.destroy();
	});

	const retry = () => {
		const u = authStore.getState().user;
		if (overlayTimer !== null) { clearTimeout(overlayTimer); overlayTimer = null; }
		setResult(null);
		setShowOverlay(false);
		setStars(0);
		setTime(0);
		setPause(false);
		setShake(false);
		world?.setPaused(false);
		world?.restart(u?.fuel ?? 10_000);
	};

	const togglePause = () => {
		if (result()?.type === 'win' || result()?.type === 'loose') return;
		const next = !pause();
		setPause(next);
		setShowOverlay(next); // пауза показывает overlay сразу, без задержки
		world?.setPaused(next);
	};

	const resultKind = (): ResultKind => {
		if (pause()) return 'pause';
		return result()?.type ?? 'pause';
	};

	const group = useGroup();
	const groupLabel = (): string | null => {
		const g = group();
		if (g.chatId === null) return null;
		const emoji = g.emoji ?? '🚀';
		const name = g.nickname ?? g.title;
		return name ? `${emoji} ${name}` : null;
	};

	// Активный челлендж именно на этом уровне в этой беседе. Только в
	// active-статусе (pending_accept в игре не показываем — оппонент ещё
	// не принял, играть «в зачёт» рано).
	const challengeState = useChallenge();
	const challengeOnThisLevel = () => {
		const c = challengeState().current;
		if (!c || c.status !== 'active') return null;
		const g = group();
		if (g.chatId !== c.chatId) return null;
		if (c.level !== props.levelNumber) return null;
		return c;
	};

	// Live-таймер до конца окна игры (1 час с момента принятия).
	const [tickGame, setTickGame] = createSignal(0);
	createEffect(() => {
		if (!challengeOnThisLevel()) return;
		const id = window.setInterval(() => setTickGame(t => t + 1), 1000);
		onCleanup(() => window.clearInterval(id));
	});
	const timeLeft = (): string | null => {
		tickGame(); // dependency
		const c = challengeOnThisLevel();
		if (!c) return null;
		return formatTimeLeft(c.expiresAt);
	};

	return (
		<div class="game-screen" classList={{shake: shake()}}>
			<TopBar fuel={fuel()} time={time()} stars={stars()} />

			<Show when={groupLabel()}>
				{(label) => <div class="group-badge">{label()}</div>}
			</Show>

			<Show when={ghost().current}>
				{(g) => (
					<div class="ghost-badge">
						<img class="icon-inline" src="/icons/ghost-icon.png" alt="" />
						<b>{g().username}</b> — {g().stars}<img class="icon-inline" src="/star.png" alt="" style={{height: '1em'}} /> <code>{fmtTime(g().timeMs)}</code>
					</div>
				)}
			</Show>

			<Show when={challengeOnThisLevel()}>
				{(c) => (
					<div class="challenge-ingame">
						<div class="challenge-ingame__bg" />
						<div class="challenge-ingame__content">
							<div class="challenge-ingame__title">
								<img class="icon-inline" src="/icons/challenge-icon.png" alt="" />
								Челлендж vs <b>{c().opponentUsername}</b>
							</div>
							<Show when={timeLeft()}>
								{(tl) => <div class="challenge-ingame__timer">{tl()}</div>}
							</Show>
						</div>
					</div>
				)}
			</Show>

			<div ref={hostRef} class="game-host">
				{/* Виньетка — статичная маска по краям экрана; light.png
				    теперь внутри Pixi world и двигается со сценой. */}
				<div class="vignette" />
				{/* Красная пульсация по краям при критически низком топливе. */}
				<Show when={isLowFuel()}>
					<div class="low-fuel-alarm" />
				</Show>
			</div>

			<BottomBar
				levelNumber={props.levelNumber}
				onPause={togglePause}
				onZoomOut={() => world?.addZoom(-ZOOM_STEP)}
				onZoomIn={() => world?.addZoom(ZOOM_STEP)}
				onBoost={() => world?.boost()}
			/>

			<Show when={tutorialQueue().length > 0}>
				<TutorialOverlay tutorial={tutorialQueue()[0]!} onDismiss={dismissTutorial} />
			</Show>

			<Show when={showOverlay()}>
				<ResultScreen
					result={resultKind()}
					stars={result()?.stars ?? 0}
					timeMs={result()?.timeMs ?? time()}
					fuelSpent={result()?.fuelSpent ?? 0}
					levelNumber={props.levelNumber}
					onExit={props.onExit}
					onRetry={retry}
					onResume={togglePause}
					onNext={() => {
						const n = getNextLevelNumber(props.levelNumber);
						if (n !== null) props.onSwitchLevel(n);
					}}
				/>
			</Show>
		</div>
	);
}
