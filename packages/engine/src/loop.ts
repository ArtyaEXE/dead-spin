/**
 * Fixed-timestep игровой цикл с аккумулятором.
 *
 * Разделяет update (детерминированный, всегда шагает фиксированным dt) и
 * render (произвольная частота, получает alpha для интерполяции). Это
 * критично для физики: на слабых устройствах или при лаге вкладки цикл
 * может сделать несколько шагов подряд, но физическая модель не развалится.
 */

export type LoopUpdateFn = (dt: number) => void;
export type LoopRenderFn = (alpha: number) => void;

export type LoopOptions = {
	/** Длительность физического шага в секундах. По умолчанию 1/60 (~16.67 мс). */
	fixedDt?: number;
	/** Верхняя планка накопленного времени, чтобы избежать "спирали смерти". */
	maxFrameTime?: number;
	/** Источник времени. Для тестов можно подменить. */
	now?: () => number;
	/** Планировщик следующего кадра. В тестах подменяется на ручной. */
	scheduler?: (cb: () => void) => number;
	/** Отмена запланированного кадра. */
	cancel?: (handle: number) => void;
};

export type Loop = {
	start: () => void;
	stop: () => void;
	isRunning: () => boolean;
};

const DEFAULT_FIXED_DT = 1 / 60;
const DEFAULT_MAX_FRAME_TIME = 0.25;

export function createLoop(update: LoopUpdateFn, render: LoopRenderFn, opts: LoopOptions = {}): Loop {
	const fixedDt = opts.fixedDt ?? DEFAULT_FIXED_DT;
	const maxFrameTime = opts.maxFrameTime ?? DEFAULT_MAX_FRAME_TIME;
	const now = opts.now ?? (() => performance.now() / 1000);
	const scheduler =
		opts.scheduler ??
		((cb) =>
			globalThis.requestAnimationFrame
				? globalThis.requestAnimationFrame(() => cb())
				: (setTimeout(cb, 16) as unknown as number));
	const cancel =
		opts.cancel ??
		((h) => {
			if (globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(h);
			else clearTimeout(h as unknown as NodeJS.Timeout);
		});

	let running = false;
	let handle: number | null = null;
	let lastTime = 0;
	let accumulator = 0;

	function frame(): void {
		if (!running) return;

		const current = now();
		let frameTime = current - lastTime;
		lastTime = current;

		if (frameTime > maxFrameTime) frameTime = maxFrameTime;
		accumulator += frameTime;

		while (accumulator >= fixedDt) {
			update(fixedDt);
			accumulator -= fixedDt;
		}

		const alpha = accumulator / fixedDt;
		render(alpha);

		handle = scheduler(frame);
	}

	return {
		start() {
			if (running) return;
			running = true;
			lastTime = now();
			accumulator = 0;
			handle = scheduler(frame);
		},
		stop() {
			running = false;
			if (handle !== null) {
				cancel(handle);
				handle = null;
			}
		},
		isRunning: () => running,
	};
}
