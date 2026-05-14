/**
 * Логика «магнитного взрывателя» мины — отдельно от Pixi, чтобы юнит-тестить.
 *
 * Модель: каждая мина держит число `heat ∈ [0..1]` и метку
 * `lastInRangeAtMs`. Когда игрок в `r_detect`, heat растёт со скоростью
 * `1 / ARM_TIME` в секунду. Когда выходит — heat не падает сразу, есть
 * задержка `COOL_DELAY` (штраф за «грейзинг», нельзя мгновенно нырять
 * обратно), потом начинает остывать со скоростью `1 / COOL_TIME`.
 *
 * heat достиг 1 → мина взрывается. Если игрок в этот момент в `r_detect` —
 * kill. Если уже выскочил — мина просто потратила заряд (одноразовая).
 *
 * Все цифры подобраны под существующие 30 уровней с минами radius=28..30:
 *   r_detect = 60 → 2× radius — лезет в коридоры от 50 px
 *   ARM 2.0 с    → проскочить можно за ~0.5-1.0 c без последствий
 *   COOL 3.0 c   → остывает дольше чем греется → возвращаться рискованно
 */


export const MINE_DETECT_MULT = 2.0;
export const MINE_ARM_TIME = 2.0;
export const MINE_COOL_DELAY = 0.5;
export const MINE_COOL_TIME = 3.0;


export interface MineHeatState {
	heat: number;
	/** Момент последнего «в радиусе», ms (performance.now()). null = ни разу. */
	lastInRangeAtMs: number | null;
}


export interface MineHeatParams {
	armTime: number;
	coolDelay: number;
	coolTime: number;
}


export const DEFAULT_HEAT_PARAMS: MineHeatParams = {
	armTime: MINE_ARM_TIME,
	coolDelay: MINE_COOL_DELAY,
	coolTime: MINE_COOL_TIME,
};


/**
 * Шаг state-машины heat'а. Чистая функция: получает текущее состояние,
 * возвращает новое. Не мутирует input.
 */
export function updateHeat(
	state: MineHeatState,
	dt: number,
	inRange: boolean,
	nowMs: number,
	params: MineHeatParams = DEFAULT_HEAT_PARAMS,
): MineHeatState {
	if (inRange) {
		const heat = Math.min(1, state.heat + dt / params.armTime);
		return {heat, lastInRangeAtMs: nowMs};
	}
	// Игрок снаружи. Если ни разу не был внутри — ничего не делаем.
	if (state.lastInRangeAtMs === null) return state;

	const sinceExitMs = nowMs - state.lastInRangeAtMs;
	const coolDelayMs = params.coolDelay * 1000;
	if (sinceExitMs < coolDelayMs) return state; // удерживаем heat

	const heat = Math.max(0, state.heat - dt / params.coolTime);
	if (heat === 0) {
		// Полностью остыла — сбрасываем метку, чтобы следующий заход
		// не вычитал «лишнее» из coolDelay.
		return {heat: 0, lastInRangeAtMs: null};
	}
	return {heat, lastInRangeAtMs: state.lastInRangeAtMs};
}


/**
 * Цвет кольца как функция heat'а. Зелёный → жёлтый → красный.
 *   0.0..0.5 — зелёный → жёлтый
 *   0.5..1.0 — жёлтый → красный
 * Возвращает целое 0xRRGGBB (формат Pixi).
 */
export function heatToColor(heat: number): number {
	const t = clamp01(heat);
	// Линейная интерполяция в two-stop gradient через жёлтый.
	if (t < 0.5) {
		const k = t * 2;
		// (0,255,80) → (255,220,40)
		const r = lerp(0, 255, k);
		const g = lerp(255, 220, k);
		const b = lerp(80, 40, k);
		return rgb(r, g, b);
	}
	const k = (t - 0.5) * 2;
	// (255,220,40) → (255,50,40)
	const r = 255;
	const g = lerp(220, 50, k);
	const b = lerp(40, 40, k);
	return rgb(r, g, b);
}


function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function rgb(r: number, g: number, b: number): number {
	return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}
