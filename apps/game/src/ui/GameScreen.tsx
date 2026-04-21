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
	const [result, setResult] = createSignal<GameResult | null>(null);
	const [pause, setPause] = createSignal(false);
	const [shake, setShake] = createSignal(false);

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

				if (r.type === 'loose') {
					setShake(true);
					setTimeout(() => setShake(false), 500);
				}

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
	onCleanup(() => world?.destroy());

	const retry = () => {
		const u = authStore.getState().user;
		setResult(null);
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

			<Show when={result() || pause()}>
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
