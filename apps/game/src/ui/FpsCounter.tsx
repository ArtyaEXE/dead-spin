import {createSignal, onCleanup, onMount} from 'solid-js';


/**
 * Мини-счётчик FPS — живёт в углу экрана поверх всех UI-слоёв.
 * Меряет частоту `requestAnimationFrame` скользящим окном ~500 мс,
 * чтобы цифра не дёргалась на каждом кадре.
 */
export function FpsCounter() {
	const [fps, setFps] = createSignal(0);
	let raf = 0;
	let frames = 0;
	let windowStart = 0;

	onMount(() => {
		windowStart = performance.now();
		const tick = (): void => {
			frames++;
			const now = performance.now();
			const dt = now - windowStart;
			if (dt >= 500) {
				setFps(Math.round((frames * 1000) / dt));
				frames = 0;
				windowStart = now;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	});

	onCleanup(() => cancelAnimationFrame(raf));

	return <div class="fps-counter">{fps()} FPS</div>;
}
