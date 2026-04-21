import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import {getLevelByNumber} from '@dead-spin/levels';
import {LEVEL_COUNT} from '@dead-spin/shared';
import {api} from '../net/client';
import {authStore} from '../stores/auth';
import {progressStore} from '../stores/progress';
import {GameWorld, type GameResult} from '../game/GameWorld';
import {TopBar} from './TopBar';
import {BottomBar} from './BottomBar';
import {ResultScreen, type ResultKind} from './ResultScreen';


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

	let overlayTimer: number | null = null;

	const initWorld = (levelNumber: number) => {
		const level = getLevelByNumber(levelNumber);
		if (!level || !hostRef) return;

		const user = authStore.getState().user;
		world = new GameWorld(level, {
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
					progressStore.getState().recordLocal(levelNumber, r.stars, r.timeMs, r.fuelSpent);
					try {
						await api.levelComplete({
							level: levelNumber,
							stars: r.stars,
							timeMs: r.timeMs,
							fuelSpent: r.fuelSpent,
						});
					} catch {}
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
		void world.mount(hostRef, user?.fuel ?? 10_000);
	};

	onMount(() => initWorld(props.levelNumber));
	onCleanup(() => {
		if (overlayTimer !== null) clearTimeout(overlayTimer);
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

	return (
		<div class="game-screen" classList={{shake: shake()}}>
			<TopBar fuel={fuel()} time={time()} stars={stars()} />

			<div ref={hostRef} class="game-host">
				{/* Виньетка — статичная маска по краям экрана; light.png
				    теперь внутри Pixi world и двигается со сценой. */}
				<div class="vignette" />
			</div>

			<BottomBar
				levelNumber={props.levelNumber}
				onPause={togglePause}
				onZoomOut={() => world?.addZoom(-ZOOM_STEP)}
				onZoomIn={() => world?.addZoom(ZOOM_STEP)}
				onBoost={() => world?.boost()}
			/>

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
						const n = props.levelNumber + 1;
						if (n <= LEVEL_COUNT) props.onSwitchLevel(n);
					}}
				/>
			</Show>
		</div>
	);
}
