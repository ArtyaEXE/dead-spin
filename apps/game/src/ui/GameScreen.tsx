import {createEffect, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {getLevelByNumber, getNextLevelNumber} from '@dead-spin/levels';
import {computeRating, levelFuelTank, LOW_FUEL_FRACTION, type Rating} from '@dead-spin/shared';
import {api} from '../net/client';
import {progressStore} from '../stores/progress';
import {ghostStore, useGhost} from '../stores/ghost';
import {track} from '../analytics';
import {GameWorld, type GameResult} from '../game/GameWorld';
import {audio, type LoopHandle} from '../game/audio';
import {TopBar} from './TopBar';
import {BottomBar} from './BottomBar';
import {ResultScreen, type ResultKind} from './ResultScreen';
import {TutorialOverlay, computeTutorialQueue, markSeen} from './Tutorial';



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

	// Топливо — ресурс уровня (GDD §10): бак берётся из JSON уровня.
	const levelDef = () => getLevelByNumber(props.levelNumber);
	const fuelTank = () => levelFuelTank(levelDef() ?? {});

	const [fuel, setFuel] = createSignal(0);
	const [rating, setRating] = createSignal<Rating | null>(null);
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
		fuel() < fuelTank() * LOW_FUEL_FRACTION &&
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

				// Показ overlay откладываем, чтобы была видна анимация взрыва.
				if (overlayTimer !== null) clearTimeout(overlayTimer);
				overlayTimer = window.setTimeout(
					() => setShowOverlay(true),
					RESULT_OVERLAY_DELAY_MS,
				);

				if (r.type === 'win') {
					const rt = computeRating(levelDef() ?? {}, {collected: r.collected, timeMs: r.timeMs, fuelSpent: r.fuelSpent});
					setRating(rt);
					progressStore.getState().recordLocal(levelNumber, {...rt, timeMs: r.timeMs, fuelSpent: r.fuelSpent});
					track('level_win', {
						level: levelNumber,
						collected: r.collected,
						stars: rt.stars,
						par_hit: rt.parHit,
						full_clear: rt.fullClear,
						time_ms: r.timeMs,
						fuel_spent: r.fuelSpent,
					});
					try {
						const recording = world?.getRecording() ?? null;
						await api.levelComplete({
							level: levelNumber,
							collected: r.collected,
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
					});
				}

			},
		});
		void world.mount(hostRef, fuelTank()).then(() => {
			// После того как сцена готова — применяем ghost (если он уже
			// загружен ghostStore'ом). На случай гонки: setGhostRecording
			// будет вызвана повторно из createEffect ниже когда стор обновится.
			const cur = ghostStore.getState().current;
			world?.setGhostRecording(cur ? cur.recording : null);
		});
		track('level_start', {
			level: levelNumber,
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
		if (overlayTimer !== null) { clearTimeout(overlayTimer); overlayTimer = null; }
		setResult(null);
		setRating(null);
		setShowOverlay(false);
		setStars(0);
		setTime(0);
		setPause(false);
		setShake(false);
		world?.setPaused(false);
		world?.restart(fuelTank());
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

	return (
		<div class="game-screen" classList={{shake: shake()}}>
			<TopBar fuel={fuel()} fuelTank={fuelTank()} time={time()} stars={stars()} />

			<Show when={ghost().current}>
				{(g) => (
					<div class="ghost-badge">
						<img class="icon-inline" src="/icons/ghost-icon.png" alt="" />
						<b>{g().username}</b> — {g().stars}<img class="icon-inline" src="/star.png" alt="" style={{height: '1em'}} /> <code>{fmtTime(g().timeMs)}</code>
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
					rating={rating()}
					collected={result()?.collected ?? 0}
					parTimeMs={levelDef()?.parTimeMs ?? null}
					parFuel={levelDef()?.parFuel ?? null}
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
